//const chalk = require('chalk')
const crypto = require('crypto')
const zxcvbn = require('zxcvbn')

const { log } = require('.')

/**
 * Return random String (base64 URL-safe encoded)
 * @param {Number} bytes requested quantification
 */
const generateNonce = (bytes = 256 / 8) => {
  if (!(bytes > 0)) {
    throw new Error('expected positive integer')
  }
  log.debug('--- %sB of nonce is expected...', bytes)
  const b = crypto.randomFillSync(Buffer.alloc(bytes))
  return b.toString('base64').replace(/[/+=$]/g, (c) => {
    switch (c) {
      case '+':
        return '-'
      case '/':
        return '_'
      default:
        return ''
    }
  })
}

/**
 * Return password strength analysis if "too weak"
 * @param {Number} minStrength an Integer score (0-5)
 * @param {String} password first zxcvbn parameter
 * @param  {...any} args other zxcvbn parameters
 */
const secretAnalysis = (minStrength, password, ...args) => {
  const validStrength = [0, 1, 2, 3, 4, 5].some((min) => min === minStrength)
  if (!validStrength || typeof password !== 'string') {
    throw new Error('invalid password (String) or min strength {0,5} score for zxcvbn')
  }
  const p = zxcvbn(password, ...args)
  const isWeak = p.score < minStrength
  return isWeak ? p : password
}

/**
 * Return password if strong enough; Error thrown if "too weak"
 * @param {Number} minStrength an Integer score (0-5)
 * @param {String} password first zxcvbn parameter
 * @param  {...any} args other zxcvbn parameters
 */
const secretStrength = (minStrength, password, ...args) => {
  const p = secretAnalysis(minStrength, password, ...args)
  if (typeof p !== 'string') {
    throw new Error(`password is not strong enough (zxcvbn score=${p.score} < ${minStrength})`)
  }
  return p
}

/**
 * Return a password that is "strong enough" (random nonce w/ zxcvbn score)
 * @param {Number} minStrength an Integer score (0-5)
 * @param {Number} maxGenerateAttempts give up after N = 100 attempts
 * @param {Number} bits of entropy (security parameter = 256 by default)
 */
const createSecret = (minStrength, maxGenerateAttempts = 100, bits = 256) => {
  // there's probably a smarter way to do all this
  for (let i = 1; i <= maxGenerateAttempts; i += 1) {
    const password = generateNonce(bits / 8) // base64 URL safe
    const response = secretAnalysis(minStrength, password)
    if (typeof response === 'string') {
      log.debug('--- password[%s] has zxcvbn score > %d', i, minStrength)
      return password
    }
    const warning = response.feedback.warning || `zxcvbn score < ${minStrength}`
    log.debug('--- warning: generated password[%s] is weak (%s) ', i, warning)
  }
  throw new Error('failed to generate a secret with sufficient entropy')
}

module.exports = {
  createSecret,
  generateNonce,
  secretAnalysis,
  secretStrength,
}
