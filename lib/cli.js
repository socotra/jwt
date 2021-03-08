#!/usr/bin/env node
const qs = require('querystring')

const chalk = require('chalk')
const commander = require('commander')
const program = commander

const JWT = require('./jwt.js')
const PACKAGE_JSON = require('../package.json')
const login = require('./login.js') // POST /account/auth*
const { ask: _ask, log } = require('.') // inquirer, aware of:
const { createSecret, secretAnalysis } = require('./secrets.js')
const { findProfile, initProfiles } = require('./profiles.js')

program
  .name(`npx ${PACKAGE_JSON.name}`)
  .option('-d, --debug', 'enable DEBUG=* logging')
  .option('-v, --verbose', 'enable verbose output')
  .usage('[program options] <command> # see: ... help <command>')
  .version(PACKAGE_JSON.version, '-V, --version', 'print CLI version')

// XXX: messy but convenient, transforms JWT.inspect(jwt) into "tabular lines"
const prettyClaims = ({ data, metadata, token }, lines = []) => {
  const headers = Object.entries(metadata)
  lines.push('JWT w/ %s:', headers.map(([key, value]) => `${key}=${value}`).join(' '))

  const temporal = new Set(['exp', 'iat', 'nbf'])
  for (const key of Object.keys(data).sort((lhs, rhs) => lhs.localeCompare(rhs))) {
    const value = data[key]
    if (temporal.has(key)) {
      lines.push(chalk.blue('--- %s=%s (%s)'), key, value, new Date(1000 * parseInt(value, 10)).toString())
    } else {
      lines.push(chalk.blue('--- %s=%s'), key, value)
    }
  }
  lines.push(token)
  return lines
}

program // stable
  .command('inspect [token]')
  .description('print details regarding a specific token')
  .option('--format <json|table>', 'output (for humans, or machines)', 'table')
  .option('--login [env]', 'first obtain a JWT via API (default env: sandbox)')
  .option('--tenant <hostname>', 'any .co. URL (ignored if --login is absent)')
  .action(async (token, options, command) => {
    initProfiles(options, command, program)
    // TODO: support verify on HS+RS256 w/ key
    const answers = {}
    if (token) {
      // JWT passed explicitly in args
      //console.error(chalk.yellow('--- warning: prefer input over args (OS or shell may save history)'))
      // TODO: support an optional flag to pipe JWT into tool instead
      answers.token = token
    } else if (options.login) {
      // login flag can specify profile name
      const profile = await findProfile(options.login, options.tenant)
      const mode = options.tenant ? 'tenant' : 'admin'
      answers.token = await login(profile, mode)
    } else {
      // interactive input:
      const questions = [
        {
          default: process.env.JWT || '',
          message: 'JWT from API:',
          name: 'token',
          type: 'password',
        },
        /*
        {
          message: 'Key for JWT:',
          name: 'key',
          type: 'password',
          when: ({ token }) => JWT.headers(token).alg.startsWith('RS'),
        },
        */
      ]
      // TODO: support verification modes for SSO, and HS256 JWTs
      // TODO: support verification mode=$profile using API_URL(s)
      Object.assign(answers, await _ask(questions))
    }

    const jwt = answers.token // String
    const unverified = JWT.inspect(jwt)
    // TODO: other formats?
    switch (command.format) {
      case 'json':
        console.log(JSON.stringify(unverified))
        break
      case 'table':
      default: {
        const lines = prettyClaims(unverified)
        for (const line of lines) console.log(line)
      }
    }
  })

// TODO: check profile upfront and catch/retry common mistakes here?
const interactiveAuth = async (profile, mode) => {
  try {
    console.log(chalk.blue('--- starting interactive %s login:'), mode)
    const token = await login(profile, mode).catch((error) => chalk.red(error.message))
    const now = Date.now()
    console.log(chalk.green('--- current timestamp: %s=%s'), now, new Date(now).toString())
    console.log(token)
  } catch (error) {
    log.debug(error)
    console.error('--- authenticate failed; please retry with --debug after checking input(s)')
  }
}

program // stable
  .command('login [env]')
  .description('authenticate with Socotra (acquire a token)')
  .option('-m, --mode <admin|admin+tenant|tenant>', 'for acquiring a token w/ specific capabilities', 'tenant')
  .option('-t, --tenant <hostname>', 'any .co. URL (for ONLY "admin+tenant" OR "tenant" mode)')
  .action(async (name, options, command) => {
    initProfiles(options, command, program)
    const profile = await findProfile(name, options.tenant)
    if (options.mode == 'admin' && options.tenant) {
      options.mode = 'admin+tenant'
    }
    await interactiveAuth(profile, options.mode)
  })

// FIXME: decide how this functionality will be exposed (think it will be needed)
const printSecret = (minStrength = 2) => {
  // I think these are fair defaults for 2021
  const m = parseInt(process.env._SECRET_MIN, 10) || minStrength
  const n = parseInt(process.env._SECRET_MAX, 10) || 100 // number of attempts
  const o = parseInt(process.env._SECRET_AES, 10) || 512 // security, in bits
  console.error(chalk.blue('--- will generate AES-%s equivalent key...'), o)
  try {
    console.log(createSecret(m, n, o))
  } catch (error) {
    log.debug(error)
    process.exitCode = 1
    console.error(chalk.yellow('--- %s [score=%s,%s,%s]'), error.message, m, n, o)
  }
}

program // unstable (possibly should be part of the zxcvbn command, or made less generic)
  .command('generate [type]')
  .description('create some datum for local usage')
  .option('--params <data...>', 'input to generator')
  .action(async (type, options, command) => {
    initProfiles(options, command, program)
    for (const param of options.params || []) {
      try {
        const parsed = qs.parse(param, ',') // a=one,b=two
        Object.assign(process.env, parsed) // sets a and b
        log.debug('--params set process.env: %j', parsed)
      } catch (error) {
        log.debug('--params ignored invalid: %s', error.message)
      }
    }
    switch (type) {
      case 'secret': {
        const allowWeakSecret = JSON.parse(process.env.ALLOW_WEAK_SECRET || 'false')
        const isExtraParanoid = JSON.parse(process.env.EXTRA_PARANOID || 'false')
        if (!isExtraParanoid) printSecret(allowWeakSecret ? 0 : 2)
        else printSecret(4) // maximum security mode
        break
      }
      default:
        console.error(chalk.red('--- USAGE: %s generate secret'), 'npx github:socotra/jwt#main')
        process.exitCode = 1
    }
  })

// FIXME: this fn is kind of messy, but it provides the useful "check" output
const checkSecret = (minStrength, passwordString, zxcvbnOptions) => {
  const strongEnough = secretAnalysis(minStrength, passwordString, zxcvbnOptions)
  if (typeof strongEnough === 'string') {
    return {
      options: zxcvbnOptions,
      paranoia: minStrength,
      zxcvbn: strongEnough,
    }
  }
  process.exitCode = 1 // what follows is a detailed analysis w/o printing the password itself
  const bold = (yes, fmt, ...args) => console.error(yes ? chalk.bold(fmt) : fmt, ...args)
  bold(true, '--- warning: password might be easy to guess!')
  for (const s of strongEnough.feedback.suggestions) {
    bold(false, s) // print actionable suggestions first
  }

  const ENV_MAX_GUESS = 100 * 100 * 365 // upper bound: 100x guess ~3-100/day
  const guesses = Math.ceil(strongEnough.guesses / ENV_MAX_GUESS).toFixed()
  const guess10 = Math.floor(strongEnough.guesses_log10).toFixed()
  const warning = strongEnough.feedback.warning
  if (warning) bold(true, chalk.red('--- special alert: %s'), warning)
  bold(false, 'Ask questions like: who/what will this secret defend against?')
  bold(true, '--- security broken, assuming est. ~1e%s attempts to crack:', guess10)
  const crack = Object.values(strongEnough.crack_times_display)
  // list of ?common threat model archetypes (from weak to strong adversary)
  const enemy = ['slow computers', 'fast computers', 'a professional', 'state actors']
  bold(false, '" in ~%s year(s) assuming standard Socotra lock-out policy', guesses)
  crack.forEach((t, i) => bold(false, '" in %s by %s', t, enemy[i]))
  bold(false, chalk.blue('Analysis by %s took: %sms'), 'zxcvbn', strongEnough.calc_time)
}

program // unstable
  .command('zxcvbn [password]')
  .description('library to analyze secrets')
  .option(
    // = min strength (supported by library)
    '--model <score>',
    'adversary level (integer 0-5, where 0 = accept anything, and 5 = never strong enough)',
    2,
  )
  .action(async (password, options, command) => {
    initProfiles(options, command, program)
    /*
    if (password) {
      // TODO: option to read from stdin
      console.error(chalk.yellow('--- warning: prefer input over args (OS or shell may save history)'))
    }
    */
    const secret = password || ''
    const answers = await _ask([
      {
        message: 'Secret:',
        name: 'secret',
        type: 'password',
        when: !secret,
      },
    ])
    const s = answers.secret || secret // password, username(s):
    const zxcvbnWordList = JSON.parse(process.env.WORD_LIST || '[]')
    const isExtraParanoid = JSON.parse(process.env.EXTRA_PARANOID || 'false')
    const allowWeakSecret = JSON.parse(process.env.ALLOW_WEAK_SECRET || 'false')
    const modelStrength = parseInt(options.model, 10) || 2 // professional level
    const minStrength = isExtraParanoid ? 4 : allowWeakSecret ? 0 : modelStrength
    console.error(chalk.blue('--- checking password strength...'))
    if (checkSecret(minStrength, s, zxcvbnWordList)) {
      console.error(chalk.green('--- security OK ✅'))
    } else {
      console.error(chalk.red('--- NOPE 🛑'))
    }
  })

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

if (module === require.main) main()
