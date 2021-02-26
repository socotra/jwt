const crypto = require('crypto')

const JWT = require('njwt')

const _decode = (jwt, idx, parse = false) => {
  const base64 = String(jwt).split('.')[idx]
  const text = Buffer.from(base64, 'base64')
  return parse ? JSON.parse(text) : text
}

const headers = (jwt, ...args) => Object.assign(_decode(jwt, 0, true), ...args)
const inspect = (jwt, key = false, alg) => {
  if (key) JWT.verify(jwt, key, alg)
  return {
    data: _decode(jwt, 1, true),
    metadata: headers(jwt),
    signature: _decode(jwt, 2, false),
    token: jwt,
  }
}

const _create = (alg, key, ...args) => {
  const body = Object.assign({}, ...args)
  return JWT.create(body, key, alg).compact()
}

const _verify = (jwt, key, alg) => {
  const { body, header } = JWT.verify(jwt, key, alg)
  return [Object.assign({}, body), key, header.alg]
}

const keyPair = (type = 'rsa', bits = 4096) => {
  return crypto.generateKeyPairSync(type, {
    modulusLength: bits,
    privateKeyEncoding: {
      format: 'pem',
      type: 'pkcs8',
    },
    publicKeyEncoding: {
      format: 'pem',
      type: 'pkcs1',
    },
  })
}

const _genKey = (type = 'HS256') => {
  const base64safe = (buffer) => {
    const base64 = buffer.toString('base64')
    return base64.replace(/[+/=]/g, (c) => {
      switch (c) {
        case '+':
          return '-'
        case '/':
          return '_'
        case '=':
        default:
          return ''
      }
    })
  }
  switch (type) {
    case 'HS256':
      return base64safe(crypto.randomFillSync(Buffer.alloc(256 / 8)))
    case 'RS256':
      return keyPair('rsa', 256 * 8).privateKey // contains publicKey
    default:
      throw new Error(`unknown JWT key type requested: ${type}`)
  }
}

module.exports = {
  _create,
  _decode,
  _genKey,
  _verify,
  headers,
  inspect,
}
