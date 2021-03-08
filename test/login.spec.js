/* eslint-env mocha, node */
const assert = require('assert')

const { fetch, log, SANDBOX_DOMAIN_NAME } = require('../lib/index.js')

const PACKAGE_JSON = require('../package.json')
const { findProfile } = require('../lib/profiles.js')
const login = require('../lib/login.js')

const basicTests = async (profileName, loginMode) => {
  const assertIn = (values, key) => {
    assert(values[key], `missing ${key} in .../${profileName}.env (mode: ${loginMode})`)
  }
  const withProfile = (envProfile) =>
    function () {
      this.timeout(120 * 1000) // a few "fast" network requests =/
      // this API returns 200 OK when Authorization is valid
      const url = envProfile.API_URL + '/v1/ping/authorized'

      before(async () => {
        assertIn(envProfile, 'TENANT_USERNAME')
        assertIn(envProfile, 'TENANT_PASSWORD')
        assertIn(envProfile, 'TENANT_HOSTNAME')
        assertIn(envProfile, 'API_URL')
        assertIn(envProfile, 'ADMIN_USERNAME')
        assertIn(envProfile, 'ADMIN_PASSWORD')
      })

      it(`returns JWT to GET ${url} ok`, async function () {
        const jwt = await login(envProfile, `${loginMode}-ask`)
        assert(jwt, 'expected JWT in login mode=' + loginMode)

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        })
        assert(res.ok, await res.text())
      })
    }

  const adminProfile = await findProfile(profileName)
  // FIXME: non-interactive login ignores tenant creds?
  const tenantProfile = Object.assign({}, adminProfile, {
    ADMIN_PASSWORD: adminProfile.TENANT_PASSWORD,
    ADMIN_USERNAME: adminProfile.TENANT_USERNAME,
  })
  switch (loginMode) {
    case 'admin':
      return withProfile(adminProfile)
    case 'admin+tenant':
      return withProfile(adminProfile)
    case 'tenant':
      return withProfile(tenantProfile)
    default:
      return function () {
        it('is not yet supported')
      }
  }
}

describe('lib', async () => {
  before(async function () {
    if (JSON.parse(process.env.DEBUG || 'false')) {
      require('debug').enable(PACKAGE_JSON.name)
    }
  })

  // TODO: make sure all modes pass against sandbox.env (local profile)
  describe('login (sandbox admin)', await basicTests('sandbox', 'admin'))
  describe('login (sandbox admin+tenant)', await basicTests('sandbox', 'admin+tenant'))
  describe('login (sandbox bootstrap+sso)', await basicTests('sandbox', 'bootstrap+sso'))
  describe('login (sandbox tenant)', await basicTests('sandbox', 'tenant'))

  describe('login (failures)', function () {
    const profileName = 'fake'
    const fakeProfile = {
      ADMIN_PASSWORD: 'root',
      ADMIN_USERNAME: profileName,
      API_URL: `https://api.${SANDBOX_DOMAIN_NAME}`,
      TENANT_HOSTNAME: `${profileName}-configeditor.co.${SANDBOX_DOMAIN_NAME}`,
      TENANT_PASSWORD: 'socotra',
      TENANT_USERNAME: 'alice.lee',
    }

    const cases = {
      // negative tests throw w/ 401
      'rejects invalid admin': async () => login(fakeProfile, 'admin-ask'),
      'rejects invalid tenant': async () => login(fakeProfile, 'tenant-ask'),
    }
    for (const [key, value] of Object.entries(cases)) {
      it(key, async function () {
        this.timeout(120 * 1000) // a few "fast" network requests =/
        try {
          await value()
          throw new Error('unexpected login success')
        } catch (error) {
          log.debug(error)
          assert(error instanceof Error)
        }
      })
    }
  })
})
