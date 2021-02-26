#!/usr/bin/env node
//const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const chalk = require('chalk')
const commander = require('commander')
const debug = require('debug')
const dotenv = require('dotenv')
//const fetch = require('node-fetch')
//const inquirer = require('inquirer')
//const zxcvbn = require('zxcvbn')
const program = commander

const JWT = require('./jwt.js')
const PACKAGE_JSON = require('../package.json')

const ENV_FILE_ROOT = process.env.ENV_FILE_ROOT || path.resolve(os.homedir(), '.socotra')
const SANDBOX_DOMAIN_NAME = process.env.SANDBOX_DOMAIN_NAME || 'sandbox.socotra.com'

/*
const log = Object.freeze({
  debug: debug(PACKAGE_JSON.name),
})

const prompt = inquirer.createPromptModule()
const _ask = async (questions, ...args) => {
  const defaults = Object.assign({}, ...args)
  try {
    const answers = await prompt(questions)
    return answers
  } catch (error) {
    log.debug(error)
    return defaults
  }
}

let _request = 0 // monotonic counter
const _fetch = async (first, ...rest) => {
  const seq = (_request += 1).toFixed()
  const start = process.hrtime()
  const _timed = (req, res) => {
    const [s, ns] = process.hrtime(start)
    const ms = Number(s * 1e3 + ns / 1e6).toFixed()
    const noResponse = res instanceof Error
    const koResponse = noResponse || !res.ok

    if (koResponse) {
      const detail = `#${seq.padStart(8)}: => ${res.status} ${res.statusText}`
      const id = noResponse ? 'none' : res.headers.get('socotra-request-id')
      log.debug(chalk.yellow(`${detail} (ID: ${id}; RTT: ~${ms}ms)`))
    }
    if (noResponse) {
      throw res
    }
    return res
  }

  const request = new fetch.Request(first, Object.assign({ method: 'GET' }, ...rest))
  log.debug(chalk.blue(`#${seq.padStart(8)}: <= ${request.method} ${request.url} (pending)`))
  return _timed(request, await fetch(request).catch((err) => err)) // TODO: consider retry mechanism?
}
*/
const { ask: _ask, fetch: _fetch, log } = require('.')

const authBasic = async ({ api, password, username }) => {
  log.debug('attempting Basic auth for "%s" via: %s', username, api)
  const response = await _fetch(api, {
    headers: {
      Authorization: 'Basic ' + Buffer.from([username, password].join(':')).toString('base64'),
    },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(`Socotra account credentials may be invalid (or expired/disabled? ${await response.text()})`)
  }
  return response.json()
}

const configure = (file = path.resolve(ENV_FILE_ROOT, `${process.env.ENV_FILE_NAME || ''}.env`)) => {
  if (fs.existsSync(file)) {
    log.debug('loading env from file: %s', file)
    dotenv.config({
      path: file,
    })
    log.debug('loaded env from file: %s', file)
  } else {
    log.debug('env file not found: %s', file)
  }
}

/*
// TODO: support account bootstrap using SSO magic and/or JWT secret
const envSecret = (env = process.env) => {
  //configure() // using default .../.env
  return env.JWT_SECRET || ''
}

const genPassword = (bytes = 256 / 8) => {
  return crypto.randomFillSync(Buffer.alloc(bytes)).toString('base64')
}

const isStrongEnough = (password = genPassword(), minStrength = 2) => {
  const { feedback, score } = zxcvbn(password)
  if (score < minStrength) {
    throw new Error(`password too weak: ${feedback.warning} (${feedback.suggestions.join(' and/or ')})`)
  }
  return password
}
*/

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
const login = async (env = process.env, useMode = 'admin') => {
  const username = env.ADMIN_USERNAME || env.TENANT_USERNAME || ''
  const password = env.ADMIN_PASSWORD || env.TENANT_PASSWORD || ''
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
    const noAsk = async (api = url) => {
      const { authorizationToken, expiresTimestamp } = await authBasic({ api, password, username })
      log.debug('--- token will expire: %s=%s', expiresTimestamp, new Date(expiresTimestamp).toString())
      return authorizationToken
    }
    switch (useMode) {
      case 'admin-ask':
        return noAsk() // no additional information
      case 'admin+tenant-ask':
        return noAsk(`${url}Admin?hostName=${hostname}`)
      /*
      case 'secret+bootstrap-ask':
        return bootstrap()
      */
      case 'tenant-ask':
        return noAsk(`${url}?hostName=${hostname}`)
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

const init = (...commands) => {
  if (program.debug) {
    debug.enable(PACKAGE_JSON.name)
  }
  if (program.verbose) {
    const ignored = new Set(['args', 'commands', 'options', 'parent', 'program', 'rawArgs'])
    for (const [index, command] of Object.entries(commands)) {
      for (const [key, value] of Object.entries(command)) {
        const ignore = key.startsWith('_') || ignored.has(key)
        if (ignore || typeof value === 'function') continue
        log.debug('--- init[%s].%s=%s', index, key, value)
      }
    }
  }
}

// TODO: deduce tenant from locator/name?
const find = async (env = '', tenant = '') => {
  log.debug('--- will configure using: %s + %s', env || '<no env>', tenant || '<no tenant>')
  configure(path.resolve(ENV_FILE_ROOT, `${env}.env`))
  const copy = Object.assign({}, process.env)
  switch (env) {
    case 'dev':
    case 'docker-dev':
    case 'local-dev':
      env.API_URL = 'http://localhost:8080'
      break
    case 'develop':
    case 'sandbox':
    case 'staging':
      env.API_URL = `https://api.${env}.socotra.com`
      break
    default:
  }
  if (tenant) {
    copy.TENANT_HOSTNAME = tenant
  }
  return copy
}

const dump = ({ data, metadata, token }) => {
  const headers = Object.entries(metadata)
  console.log('JWT w/ %s:', headers.map(([key, value]) => `${key}=${value}`).join(' '))

  const temporal = new Set(['exp', 'iat', 'nbf'])
  for (const key of Object.keys(data).sort((lhs, rhs) => lhs.localeCompare(rhs))) {
    const value = data[key]
    if (temporal.has(key)) {
      console.log(chalk.blue('--- %s=%s (%s)'), key, value, new Date(1000 * parseInt(value, 10)).toString())
    } else {
      console.log(chalk.blue('--- %s=%s'), key, value)
    }
  }
  console.log(token)
}

/*
const bootstrap = async (env = process.env, usePrompt = false) => {
  const API_URL = env.API_URL || `https://api.${SANDBOX_DOMAIN_NAME}`
  const JWT_SECRET = env.JWT_SECRET // no default value (minimum length)
  const { api = API_URL, key = JWT_SECRET, name, password, username } = await _ask([
    {
      default: API_URL, // ping
      message: 'API URL (customer specific, for account creation):',
      name: 'api',
      when: usePrompt,
    },
    {
      default: JWT_SECRET, // long enough
      message: 'JWT secret (customer specific, very sensitive):',
      name: 'key',
      type: 'password',
      when: usePrompt,
    },
    {
      message: 'Username (at least six characters; ONLY: alphanumeric or underscores):',
      name: 'username',
      when: usePrompt,
    },
    {
      // demand Title Case? (or, same as username)
      message: 'Display name (proper moniker, visible in UIs; may contain spaces):',
      name: 'name',
      when: usePrompt,
    },
    {
      // run through zxcvbn
      message: 'Password (sufficiently long and complex for security rules):',
      name: 'password',
      type: 'password',
      validate: async ({ password }) => isStrongEnough(password),
      when: usePrompt,
    },
    {
      type: 'confirm',
    },
  ])
  // TODO: enforce username and password rules w/ post-check
  const body = {
    password: password || env.password || 'socotra',
    username: username || env.username || 'root',
  }
  body.name = name || env.name || body.username
  if (!body.name || !body.username) {
    throw new Error('missing: name and/or username')
  }
  const url = api || env.API_URL || `https://api.${SANDBOX_DOMAIN_NAME}`
  const secret = key || env.JWT_SECRET || '' // TODO: support JWTSECRET
  if (!url || !secret) {
    throw new Error('missing: API_URL or JWT_SECRET')
  }
  const sub = 'root' // this can be any value
  const jwt = JWT._create('HS256', key || env.JWT_SECRET, {
    'account.name': sub,
    'account.type': 'internal.admin',
    'account.uuid': sub,
    sub, // library will provide exp and iat
  })
  log.debug('--- using JWT bootstrap:', jwt)
  const response = _fetch(`${url}/account/v1/account`, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    method: 'POST',
  })
  if (!response.ok) {
    const detail = response.status === 409 ? 'username taken' : 'check credentials'
    throw new Error(`failed to create new internal admin account (${detail})`)
  }
  const account = await response.json()
  log.debug('--- created API account:', account)
  return account
}
*/

program
  .name(`npx ${PACKAGE_JSON.name}`)
  .option('-d, --debug', 'enable DEBUG=* logging')
  .option('-v, --verbose', 'enable verbose output')
  .usage('[options] <command> [args] # see: ... help <command>')
  .version(PACKAGE_JSON.version, '-V, --version', 'print CLI version')

/*
program
  .command('bootstrap [env]')
  .option('--format <json|table>', 'output for humans, or machines (default: json)', 'json')
  .option('--secret <key>', 'to self-sign prior to actual account creation (default: $JWT_SECRET)', envSecret())
  .action(async (env, command) => {
    init(program, command)
    const account = await bootstrap(await find(env)) // will default to env or sandbox
    console.log('account %s username/password: %s/%s', account.id, account.username, account.password) // FIXME
  })

program // unstable
  .command('verify [env]')
  .option('--ping [url]', 'after, ensure APIs will actually respond appropriately')
  .requiredOption('--token <jwt>', 'avoid prompt, set Authorization appropriately')
  .action(async (env, command) => {
    init(program, command)
    // somehow avoid prompt?
    const { api, jwt, key } = await prompt([
      {
        default: command.ping,
        message: 'API URL',
        name: 'api',
      },
      {
        message: 'JWT secret',
        name: 'key',
        type: 'password',
      },
      {
        default: command.token || '',
        message: 'JWT (if known)',
        name: 'jwt',
      },
    ])
    if (api) {
      const url = api.endsWith('/v1/ping/authorized') ? api : `${api}/v1/ping/authorized`
      const response = await _fetch(url, {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      })
      const text = await response.text()
      if (text === 'api') {
        console.log(chalk.green('OK'))
      } else {
        console.error(chalk.red(text))
      }
      return
    }
    try {
      JWT.verify(jwt, key) // TODO: use [body] returned?
      console.log(chalk.green('OK'))
    } catch (error) {
      console.log(chalk.red(error.message))
      console.error(error)
    }
  })
*/

program // stable
  .command('inspect [token]')
  .option('--format <json|table>', 'output (for humans, or machines)', 'table')
  .option('--login [env]', 'first obtain a JWT via API (default env: sandbox)')
  .action(async (token, command) => {
    init(program, command)
    const answers = {} // TODO: support verify on HS+RS256 w/ key
    if (token) {
      // JWT passed explicitly in args
      answers.token = token
    } else if (command.login) {
      const env = await find(command.login)
      answers.token = await login(env)
    }
    /*
    } else {
      // interactive mode, to support SSO eventually:
      const questions = [
        {
          default: process.env.JWT,
          message: 'JWT from API:',
          name: 'token',
        },
        {
          message: 'Key for JWT:',
          name: 'key',
          when: ({ token }) => JWT.headers(token).alg.startsWith('RS'),
        },
      ]
      Object.assign(answers, await _ask(questions))
    }
    */

    const raw = answers.token // String
    const unverified = JWT.inspect(raw)
    // TODO: other formats?
    switch (command.format) {
      case 'json':
        console.log(JSON.stringify(unverified))
        break
      case 'table':
      default:
        dump(unverified)
    }
  })

/*
program // unstable
  .command('bootstrap [env]')
  //.option('-t, --tenant <hostname>', 'any .co. URL')
  .action(async (env, command) => {
    init(program, command)
    await find(env, command.tenant)
    // TODO: call login w/ bootstrap
  })
*/

program // stable
  .command('login [env]')
  .option('-m, --mode <admin|admin+tenant|tenant>', 'for acquiring a token w/ specific capabilities', 'tenant')
  .option('-t, --tenant <hostname>', 'any .co. URL (for ONLY "admin+tenant" OR "tenant" mode)')
  .action(async (env, command) => {
    init(program, command)
    const options = await find(env, command.tenant)
    if (command.mode == 'admin' && command.tenant) {
      command.mode = 'admin+tenant'
    }

    console.log(chalk.green('--- starting interactive %s login:'), command.mode)
    const token = await login(options, command.mode).catch((error) => chalk.red(error.message))
    const now = Date.now()
    console.log(chalk.green('--- current timestamp: %s=%s'), now, new Date(now).toString())
    console.log(token)
  })

/*
program // unstable
  .command('toggle [env]')
  .requiredOption('-t, --tenant <hostname>', 'any .co. URL')
  .action(async (env, command) => {
    const set = (configProperties, special = 'property.enabled') => {
      const all = new Set(Object.keys(configProperties))
      all.delete(special) // safety
      return Array.from(all)
        .sort((lhs, rhs) => {
          const left = configProperties[lhs] || false
          const right = configProperties[rhs] || false
          return left === right ? lhs.localeCompare(rhs) : left - right
        })
        .map((one) => {
          return {
            name: `${one} (currently ${configProperties[one] ? 'enabled' : 'disabled'})`,
            value: one,
          }
        })
        .concat(new inquirer.Separator(), {
          name: `${special} (custom flag)`,
          value: special,
        })
    }
    const log = (prefix, { configProperties }) => {
      console.log('--- config properties (%s)', prefix)
      for (const name of Object.keys(configProperties).sort()) {
        console.log(chalk.blue('--- %s: %s'), name, configProperties[name])
      }
      console.log('---')
      return configProperties
    }

    init(program, command)
    const options = await find(env, command.tenant)
    const { API_URL, TENANT_HOSTNAME, ADMIN_USERNAME, ADMIN_PASSWORD } = _ask([
      {
        default: options.API_URL || `http://api.${SANDBOX_DOMAIN_NAME}`,
        message: 'Socotra API URL:',
        name: 'API_URL',
      },
      {
        message: 'Tenant hostname:',
        name: 'TENANT_HOSTNAME',
      },
      {
        message: 'Admin username:',
        name: 'ADMIN_USERNAME',
      },
      {
        message: 'Admin password:',
        name: 'ADMIN_PASSWORD',
        type: 'password',
      },
    ])
    const token = await login({ ADMIN_PASSWORD, ADMIN_USERNAME, API_URL, TENANT_HOSTNAME }, 'admin+tenant-ask')
    const get = await _fetch(`${API_URL}/tenant/v1/tenant/config/properties`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    if (!get.ok) {
      throw new Error(await get.text())
    }
    const known = log('before', await get.json())
    const { featureName, isEnabled } = _ask([
      {
        choices: set(known),
        name: 'featureName',
        type: 'choice',
      },
      {
        name: 'isEnabled',
        type: 'confirm',
      },
      {
        message: (t) => {
          return `Please confirm ${TENANT_HOSTNAME}: set ${t.featureName}=${t.isEnabled}`
        },
        name: 'toggleConfirmed',
        type: 'confirm',
      },
    ])
    const res = await _fetch(`${API_URL}/tenant/v1/tenant/config/property`, {
      body: JSON.stringify({
        configProperty: featureName,
        value: Boolean(isEnabled),
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    if (!res.ok) {
      throw new Error(await res.text())
    }
    log('after', await res.json())
  })
*/

/**
 * Please see README for how to use `commander` and `inquirer` (CLI and prompt)
 *
 * Note: `inspect` is a pretty straightforward example command (supports --login)
 */
const main = async () => {
  try {
    // TODO: default command?
    await program.parseAsync()
  } catch (error) {
    console.error(
      chalk.red(`
---
--- FATAL: ${error.message}
--- Open an issue (bug) or PR (fix) here: ${PACKAGE_JSON.bugs.url}
--- Please include any error messages + reproduction steps, notify @hagemt, etc.
---
`),
    )
    console.error(error)
    process.exitCode = 1
    program.help()
  }
}

if (!module.parent) {
  main()
}
