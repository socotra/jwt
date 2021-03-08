/* eslint-env mocha, node */
const assert = require('assert')
const crypto = require('crypto')

const JWT = require('../lib/jwt.js')

const rsaPublic = (key, type = 'pkcs1') => {
  const format = 'pem'
  const pub = crypto.createPublicKey({
    format,
    key,
  })
  return pub.export({
    format,
    type,
  })
}

describe('lib', function () {
  it('supports the HS256 algorithm (for JWTs)', function () {
    const secret = process.env.HS256_SECRET || JWT._genKey('HS256')
    const who = process.env.USER || 'nobody'
    const now = Math.round(Date.now() / 1000)
    const expires = 3600
    const expected = {
      aud: who,
      exp: expires,
      iat: now,
      iss: who,
      jti: who,
      //nbf: now + 60, // nbf = not before (future)
      sub: who,
    }
    const output = JWT._create('HS256', secret, expected)
    const [data] = JWT._verify(output, secret, 'HS256')
    const actual = Object.assign(data, { exp: expires })
    assert.deepStrictEqual(actual, expected)
  })

  it('supports RSA key pairs, too (for JWTs)', function () {
    const secret = JWT._genKey('RS256')
    const shared = rsaPublic(secret)
    const input = {
      socotra: 'account',
    }
    const output = JWT._create('RS256', secret, input)
    const [data] = JWT._verify(output, shared, 'RS256')
    assert.equal(data.socotra, input.socotra)
  })
})
