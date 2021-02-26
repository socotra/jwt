const chalk = require('chalk')
const debug = require('debug')
const fetch = require('node-fetch')
const inquirer = require('inquirer')

const LOG_NAME = '@socotra/jwt'
const _log = Object.freeze({
  debug: debug(LOG_NAME),
})

const _header = 'socotra-request-id' // vendor specific
const _pad = (any, len = 0) => {
  const str = any ? (typeof any === 'number' ? any.toFixed() : any.toString()) : ''
  return len ? str.padStart(len) : str
}

/**
 * Integrate WHATWG `fetch` (or similar) with `debug` logging, with bonus:
 * - basic info regarding the req and res, e.g. HTTP #1: <= POST $URL => 200 OK
 * - report server latency from client's perspective (round-trip time = RTT in ms)
 * - color support; red on failure, yellow on "slow" RTT, and green for <1s (faster)
 * - include an ID on each request (monotonic) as well as the server's (if available)
 * Some "hidden features" that it might make sense to expose later, such as "retry"
 */
let _request = 0 // monotonic counter
const _fetch = async (url, ...args) => {
  const etc = Object.assign({ _details: 0, _hrtime: 0, _http: 0, _retry: 0, _seq: 0, method: 'GET' }, ...args)
  const details = etc._details || 'pending'
  const hrtime = etc._hrtime || process.hrtime
  const http = etc._http || (async (req) => fetch(req).catch((err) => err))
  const retry = etc._retry // default: no retry (fail fast)
  const seq = etc._seq || _pad((_request += 1), 8)
  const timed = (res, start = hrtime()) => {
    const [s, ns] = hrtime(start)
    const isResponse = !(res instanceof Error)
    const koResponse = !isResponse || !res.ok
    // under 1s is decent, but we can bring down the number over time
    const color = !koResponse ? (s < 1 ? chalk.green : chalk.yellow) : chalk.red
    const out = `request ID: ${isResponse ? res.headers.get(_header) : 'none'}; API RTT: ${_pad(s * 1e3 + ns / 1e6)}ms`
    _log.debug(color(`HTTP #${seq}: => ${_pad(res.status || 'network', 5)} ${res.statusText || 'failure'} (${out})`))
  }

  const req = new fetch.Request(url, etc)
  _log.debug(chalk.blue(`HTTP #${seq}: <= ${_pad(req.method, 5)} ${req.url} (${details})`))
  const start = hrtime()
  try {
    const res = await http(req)
    timed(res, start)
    return res
  } catch (err) {
    timed(err, start)
    if (retry) {
      _log.debug(chalk.blue(`HTTP #${seq}: <> ${retry} retry...`))
      const _retry = retry > 0 ? retry - 1 : 0
      return _fetch(url, ...args, { _retry })
    }
    throw err
  }
}

/**
 * Customized interactive input w/ defaults
 */
const _prompt = inquirer.createPromptModule()
const _ask = async (questions = [], ...args) => {
  const defaults = Object.assign({}, ...args)
  try {
    const answers = await _prompt(questions)
    return answers
  } catch (error) {
    _log.debug(error)
    return defaults
  }
}

debug.enable(LOG_NAME)
module.exports = {
  ask: _ask,
  fetch: _fetch,
  log: _log,
}
