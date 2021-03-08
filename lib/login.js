const chalk = require('chalk')

const { ask: _ask, fetch: _fetch, log, SANDBOX_DOMAIN_NAME } = require('.')

/**
 * Login (works for admins or non-admins) example: POST "$API_URL/account/authenticate?hostName=$TENANT_HOSTNAME"
 * @param {Object} strings w/ api (endpoint URL w/ query) for POST, as well as username and password (credentials)
 */
const authBasic = async ({ api, password, username }) => {
  log.debug('attempting Basic auth for "%s" via: %s', username, api)
  const auth = Buffer.from([username, password].join(':'))
  const response = await _fetch(api, {
    headers: {
      Authorization: 'Basic ' + auth.toString('base64'),
    },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(`Socotra account credentials may be invalid (or expired/disabled? ${await response.text()})`)
  }
  return response.json()
}

/**
 * Supported modes:
 * - admin (default: only requires API URL + creds)
 * - tenant (incl. claims-only, read-only users)
 * Unsupported but recognized modes:
 * - secret+bootstrap (create an account)
 * - *-ask (non-interactive variants)
 * Unsupported modes:
 * - any relevant variants of SSO
 * - admin+tenant, for user MGMT
 */
const login = async (env = process.env, useMode = 'tenant') => {
  const username = env.TENANT_USERNAME || env.ADMIN_USERNAME || ''
  const password = env.TENANT_PASSWORD || env.ADMIN_PASSWORD || ''
  const hostname = env.TENANT_HOSTNAME || '' // optional (for admin)
  const prefix = env.SOCOTRA_TENANT || `${username}-configeditor`
  const suffix = env.SOCOTRA_DOMAIN || SANDBOX_DOMAIN_NAME
  const url = env.API_URL || `https://api.${suffix}`

  // by default: map login({}, !!truthy) to tenant login, else: admin mode
  if (typeof useMode !== 'string') {
    //let tenant = useMode || hostname
    useMode = useMode ? 'tenant' : 'admin'
  }
  // TODO: SSO support
  if (useMode.startsWith('sso')) {
    throw new Error('SSO login is not yet supported (by this tool)')
  }
  // support some non-interactive call variants
  if (useMode.endsWith('-ask')) {
    const noAsk = async (api, credentials = { name: username, secret: password }) => {
      const { name, secret, url } = Object.assign({ url: api }, credentials)
      log.debug('--- non-interactive %s login for %s: POST %s', useMode, name, api)
      const { authorizationToken, expiresTimestamp } = await authBasic({ api: url, password: secret, username: name })
      log.debug('--- token will expire: %s=%s', expiresTimestamp, new Date(expiresTimestamp).toString())
      return authorizationToken
    }
    const api = `${url}/account/authenticate` // POST endpoint
    switch (useMode) {
      case 'admin-ask':
        return noAsk(`${api}Admin`, {
          name: env.ADMIN_USERNAME,
          secret: env.ADMIN_PASSWORD,
        })
      case 'admin+tenant-ask':
        return noAsk(`${api}Admin?hostName=${hostname}`, {
          name: env.ADMIN_USERNAME,
          secret: env.ADMIN_PASSWORD,
        })
      /*
      case 'secret+bootstrap-ask':
        return bootstrap()
      */
      case 'tenant-ask':
        return noAsk(`${api}?hostName=${hostname}`, {
          name: env.TENANT_USERNAME,
          secret: env.TENANT_PASSWORD,
        })
      default: // useMode=unknown (proceed to interactive login flow)
    }
  }

  const questions1 = [
    {
      default: url,
      message: 'API URL (for POST /account/authenticate*):',
      name: 'api',
    },
    {
      default: username || (useMode === 'tenant' ? 'alice.lee' : 'ADMIN_USERNAME'),
      message: 'Socotra username:',
      name: 'username',
    },
    {
      default: password || (useMode === 'tenant' ? 'socotra' : 'ADMIN_PASSWORD'),
      message: 'Socotra password:',
      name: 'password',
      type: 'password',
    },
  ]
  const questions2 = [
    {
      default: hostname || `${prefix}.co.${suffix}`,
      message: 'Socotra tenant:',
      name: 'tenant',
      when: useMode === 'admin+tenant' || useMode === 'tenant',
    },
    {
      message: 'JWT secret (will create account w/ username and password):',
      name: 'key',
      type: 'password',
      when: useMode === 'secret+bootstrap',
    },
  ]

  const answers = {} // will collect in two rounds
  Object.assign(answers, await _ask(questions1))
  try {
    if (!answers.api || !answers.api.startsWith('http')) {
      throw new Error(`--- missing/invalid API URL: ${answers.api} (e.g. https://api.${SANDBOX_DOMAIN_NAME} for play)`)
    }
    log.debug(`validating API URL:`, answers.api)
    const text = await _fetch(answers.api).then(
      async (res) => res.ok && res.text(),
      (error) => error.message,
    )
    if (text !== 'api') {
      throw new Error(`--- invalid API URL: ${answers.api} (are you currently offline? ${text})`)
    }
    // TODO: catch other common typos, like URLs not having common suffix (if provided)
  } catch (error) {
    console.log(chalk.red(error.message))
    throw new Error('STOP! One or more of the answers provided did not pass sanity checks (read warnings above)')
  }
  // if that worked, we can proceed according to the mode
  answers.api = `${answers.api}/account/authenticate`
  switch (useMode) {
    case 'admin+tenant':
      Object.assign(answers, await _ask(questions2))
      answers.api += `Admin?hostName=${answers.tenant}`
      break
    /*
    case 'secret+bootstrap':
      return bootstrap(answers) // TODO: make this work w/ JWT secret (for the bootstrap sub command)
    */
    case 'tenant':
      Object.assign(answers, await _ask(questions2))
      answers.api += `?hostName=${answers.tenant}`
      break
    default:
      if (useMode === 'admin') break // special case
      throw new Error(`unknown login mode: ${useMode}`)
  }

  console.log(chalk.blue('--- %s login: %s via %s'), useMode, answers.username, answers.api)
  const { authorizationToken, expiresTimestamp: exp } = await authBasic(answers) // prompt on reject?
  console.log(chalk.yellow('--- token will expire: %s=%s'), exp, new Date(parseInt(exp, 10)).toString())
  return authorizationToken
}

module.exports = login
