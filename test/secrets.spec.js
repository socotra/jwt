/* eslint-env mocha, node */
const assert = require('assert')

const PACKAGE_JSON = require('../package.json')
const { createSecret } = require('../lib/secrets.js')
const { findProfile } = require('../lib/profiles.js')

const effectiveProfile = async (profileName) => {
  const before = Object.assign({}, process.env)
  const after = await findProfile(profileName)
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

describe('secrets (profile: example)', function () {
  before(async function () {
    if (JSON.parse(process.env.DEBUG || 'false')) {
      require('debug').enable(PACKAGE_JSON.name)
    }
    await effectiveProfile('example')
  })

  it('can create secrets of various min. strengths', function () {
    for (let minStrength = 0; minStrength < 5; minStrength += 1) {
      assert(createSecret(minStrength), 'min strength=' + minStrength)
    }
  })

  it('cannot create a secret beyond max. strength=4', function () {
    assert.throws(() => createSecret(5, 1))
  })
})
