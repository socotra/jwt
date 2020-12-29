#!/usr/bin/env node

const chalk = require('chalk')
const debug = require('debug')
const fetch = require('node-fetch')
const inquirer = require('inquirer')
const program = require('commander')

const PACKAGE_JSON = require('../package.json')
const jwt = require('./jwt.js')

const log = Object.freeze({
  debug: debug(PACKAGE_JSON.name),
})

const prompt = inquirer.createPromptModule()

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

/*
const findTenantBy = async (domain, prefix, url = `https://api.${domain}`) => {
  const tenantHostname = `${prefix}.co.${domain}`
  const request = `${url}/tenant/v1/findByHostname?hostname=${tenantHostname}`
  const response = await fetch(request)

  if (response.ok) {
    const { tenantId } = await response.json()
    return tenantId
  }
  const text = await response.text()
  throw new Error(`GET ${request} => ${response.status} (${text})`)
}
*/

const login = async (env = process.env, useMode = 'admin') => {
  const username = env.ADMIN_USERNAME || ''
  const password = env.ADMIN_PASSWORD || ''
  const hostname = env.TENANT_HOSTNAME || ''
  const domain = env.SANDBOX_DOMAIN || 'sandbox.socotra.com'

  const answers = await prompt([
    {
      default: env.API_URL || `https://api.${domain}`,
      message: 'API URL (for POST /account/authenticate*):',
      name: 'env',
    },
    {
      default: username || 'alice.lee',
      message: 'Socotra username:',
      name: 'username',
    },
    {
      default: password || 'socotra',
      message: 'Socotra password:',
      name: 'password',
      //type: 'password',
    },
    {
      default: hostname || `${username}-configeditor.co.${domain}`,
      message: 'Socotra tenant:',
      name: 'tenant',
      when: ({ username }) => (useMode === 'admin' ? false : username === 'alice.lee'),
    },
  ])

  let url = `${answers.env}/account/authenticate`
  switch (useMode) {
    case 'admin+tenant':
      url = `${url}Admin?hostName=${answers.tenant}`
      break
    case 'tenant':
      url = `${url}?hostName=${answers.tenant}`
      break
    default:
  }
  log.debug('--- %s login: %s via %s', useMode, answers.username, url)
  const response = await _fetch(url, {
    headers: {
      Authorization: 'Basic ' + Buffer.from([answers.username, answers.password].join(':')).toString('base64'),
    },
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error('Socotra account credentials may be invalid (or expired/disabled)')
  }

  const json = await response.json()
  log.debug('--- token expires at: %s', new Date(parseInt(json.expiresTimestamp, 10)))
  return json.authorizationToken
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

const find = async (env, tenant) => {
  // TODO: consider load from .config file?
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
      console.log(chalk.blue('--- %s=%s (%s)'), key, value, new Date(1000 * parseInt(value, 10)))
    } else {
      console.log(chalk.blue('--- %s=%s'), key, value)
    }
  }
  console.log(token)
}

program
  .name(`npx ${PACKAGE_JSON.name} --`)
  .option('-d, --debug', 'enable DEBUG=* logging')
  .option('-v, --verbose', 'enable verbose output')
  .usage('[options] <command> [args] # (see list below)')
  .version(PACKAGE_JSON.version, '-V, --version', 'print CLI version')

program
  .command('inspect [token]')
  .option('--format <json|table>', ' "json" output, or sorted table (for humans)', 'table')
  .option('--login [env]', 'first obtain a JWT via login (rather than prompt)')
  .action(async (token, command) => {
    init(program, command)
    const questions = [
      {
        default: process.env.JWT,
        message: 'JWT from API:',
        name: 'token',
      },
      {
        message: 'Key for JWT:',
        name: 'key',
        when: ({ token }) => jwt.headers(token).alg.startsWith('RS'),
      },
    ]
    const answers = {} // TODO: support verify on HS+RS256 w/ key
    if (token) {
      answers.token = token // JWT passed explicitly in args
    } else if (command.login) {
      answers.token = await login(await find(command.login))
    } else {
      Object.assign(answers, await prompt(questions))
    }

    const raw = answers.token // String
    const unverified = jwt.inspect(raw)
    switch (command.format) {
      case 'json':
        console.log(JSON.stringify(unverified))
        break
      case 'table':
      default:
        dump(unverified)
        // TODO: other formats?
    }
  })

program
  .command('login [env]')
  .option('-m, --mode <tenant>', 'specify "tenant" or...', 'admin')
  .option('-t, --tenant <hostname>', 'any .co. url (for tenant mode)')
  .action(async (env, command) => {
    init(program, command)
    const options = await find(env, command.tenant)
    console.log(chalk.green(`--- starting interactive login:`))
    const token = await login(options, command.mode).catch((error) => chalk.red(error.message))
    console.log(chalk.green(`--- current Date: ${new Date()}`))
    console.log(token)
  })

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
`)
    )
    console.error(error)
    process.exitCode = 1
    program.help()
  }
}

if (!module.parent) {
  main()
}
