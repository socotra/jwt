/* eslint-env mocha, node */
const assert = require('assert')

const PACKAGE_JSON = require('../package.json')
const p = require('../lib/profiles.js')
const s = require('../lib/secrets.js')

const effectiveProfile = async (profileName) => {
  const before = Object.assign({}, process.env)
  const after = await p.findProfile(profileName)
  const copy = (object, key) => {
    const defaults = before[key]
    const settings = after[key]
    if (defaults !== settings) {
      //console.log('--- %s %s=%s (vs. %s)', profileName, key, settings, defaults || '<none>')
      object[key] = settings[key]
    }
    return object
  }
  const profile = Object.keys(after).reduce(copy, {})
  for (const [key, value] of Object.entries(profile)) {
    console.log('--- %s profile: %s=%s', profileName, key, value)
  }
}

describe('profile (loaded from .env)', function () {
  it('provides four simple functions', function () {
    p.envConfig('test/missing.env')
    p.envSecret({
      JWT_SECRET: 'socotra',
    })
    p.findProfile('example')
    p.initProfiles({
      verbose: true,
    })
  })
})

describe('secrets (profile: example)', function () {
  before(async function () {
    if (JSON.parse(process.env.DEBUG || 'false')) {
      require('debug').enable(PACKAGE_JSON.name)
    }
    await effectiveProfile('example')
  })

  it('can create secrets of various min. strengths (max: 4)', function () {
    // second and third parameters are optional, specify iterations + bits
    assert.throws(() => s.createSecret('strong', 1, 0))
    assert.throws(() => s.createSecret(5, 1))
    for (let minStrength = 0; minStrength < 5; minStrength += 1) {
      assert(s.createSecret(minStrength), 'min strength=' + minStrength)
    }
  })

  it('works with the profiles to load from/into process.env', function () {
    const bytes = 384 / 8
    const secret = p.envSecret({
      JWT_SECRET: s.generateNonce(bytes),
    })
    const length = (bytes * 4) / 3
    const z = s.secretAnalysis(2, secret)
    assert.strictEqual(secret.length, length)
    assert(!(z.score < 2), 'unexpected score < 2')
  })

  it('will throw only when a secret is below score', function () {
    assert.doesNotThrow(() => s.secretStrength(0, 'socotra'))
    assert.doesNotThrow(() => s.secretStrength(1, 'socotra'))
    assert.doesNotThrow(() => s.secretStrength(2, 'socotra'))
    assert.throws(() => s.secretStrength(3, 'socotra'))
    assert.throws(() => s.secretStrength(4, 'socotra'))
    assert.throws(() => s.secretStrength(5, 'socotra'))
  })
})
