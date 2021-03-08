const fs = require('fs')
const os = require('os')
const path = require('path')

const chalk = require('chalk')
const dotenv = require('dotenv')
const logging = require('debug')

const { fetch: _fetch, log, SANDBOX_DOMAIN_NAME } = require('.')
const PACKAGE_JSON = require('../package.json')

const DEFAULT_ENV_ROOT = process.env.DEFAULT_ENV_ROOT || path.resolve(os.homedir(), '.socotra')
const DEFAULT_ENV_FILE = `${process.ENV_PROFILE_NAME || ''}.env` // use SOCOTRA_ variable?
const DEFAULT_ENV_PATH = path.resolve(DEFAULT_ENV_ROOT, DEFAULT_ENV_FILE)

/**
 * Load an .env file into the current process.env
 * @param {String} file absolute path to .env file
 */
const envConfig = (file = DEFAULT_ENV_PATH) => {
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

// TODO: support account bootstrap using SSO magic and/or JWT secret
const envSecret = (env = process.env) => {
  envConfig() // using default .../.env
  return env.JWT_SECRET || ''
}

/**
 * Will load configuration from profileName.env and check if tenant exists
 * @param {String} profileName traditionally, something like "develop"
 * @param {String} tenantDescriptor currently, TENANT_HOSTNAME or ''
 */
const findProfile = async (profileName = '', tenantDescriptor = '') => {
  // GET /tenant/v1/findByHostname?hostname=$TENANT_HOSTNAME => 200 OK {"tenantId":String} (if present)
  const findTenant = async ({ API_URL = `https://api.${SANDBOX_DOMAIN_NAME}`, TENANT_HOSTNAME }) => {
    if (!API_URL || !TENANT_HOSTNAME) return
    const req = `${API_URL}/tenant/v1/findByHostname?hostname=${TENANT_HOSTNAME}`
    const res = await _fetch(req)
    if (!res.ok) throw new Error(await res.text())
    const { tenantId: tenantLocator } = await res.json()
    log.debug(chalk.blue(`--- found tenant w/ locator=%s via: GET %s`), tenantLocator, req)
  }
  log.debug('--- will configure using: %s + %s', profileName || '<default profile>', tenantDescriptor || '<no tenant>')
  envConfig(path.resolve(DEFAULT_ENV_ROOT, `${profileName}.env`))
  const profile = Object.assign({}, process.env)
  switch (profileName) {
    case 'dev':
    case 'docker-dev':
    case 'local-dev':
      profile.API_URL = 'http://localhost:8080'
      break
    case 'develop':
    case 'sandbox':
    case 'staging':
      profile.API_URL = `https://api.${profileName}.socotra.com`
      break
    default:
  }
  if (tenantDescriptor) {
    // for now, assume hostname (the API_URL must end with same domain suffix)
    profile.TENANT_HOSTNAME = tenantDescriptor
    try {
      // make best-effort attempt to find the tenant (else: log attempt)
      await findTenant(profile)
    } catch (error) {
      //log.debug(error)
      log.debug(chalk.blue('--- note: unable to lookup %s tenant: %s'), profileName, tenantDescriptor)
    }
  }
  return profile
}

/**
 * Usage: an Action fn receives two or more parameters: (...args, options, command)
 * @param {*} options the infix parameter to the Action, where flags reside
 * @param  {...any} commands traditionally, [command, program:Commander]
 */
const initProfiles = (options, ...commands) => {
  // we want "options" to specify --debug, --verbose, but default to program, then command
  const overrides = Array.from(commands, (command) => command.opts()).reverse()
  const { debug, verbose } = Object.assign({ debug: false, verbose: false }, ...overrides, options)
  if (debug) logging.enable(PACKAGE_JSON.name)
  if (verbose) {
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

module.exports = {
  envConfig,
  envSecret,
  findProfile,
  initProfiles,
}
