/*
program // unstable
  .command('toggle [env]')
  .requiredOption('-t, --tenant <hostname>', 'any .co. URL')
  .action(async (name, command, options) => {
    initProfiles(program, command, options)
    const profile = await findProfile(name, options.tenant)
    const set = (configProperties, special = 'property.enabled') => {
      const all = new Set(Object.keys(configProperties))
      all.delete(special) // safety
      return Array.from(all)
        .sort((lhs, rhs) => {
          const left = configProperties[lhs] || false
          const right = configProperties[rhs] || false
          return left === right ? lhs.localeCompare(rhs) : left - right
        })
        .map((one) => {
          return {
            name: `${one} (currently ${configProperties[one] ? 'enabled' : 'disabled'})`,
            value: one,
          }
        })
        .concat(new inquirer.Separator(), {
          name: `${special} (custom flag)`,
          value: special,
        })
    }
    const log = (prefix, { configProperties }) => {
      console.log('--- config properties (%s)', prefix)
      for (const name of Object.keys(configProperties).sort()) {
        console.log(chalk.blue('--- %s: %s'), name, configProperties[name])
      }
      console.log('---')
      return configProperties
    }

    const { API_URL, TENANT_HOSTNAME, ADMIN_USERNAME, ADMIN_PASSWORD } = _ask([
      {
        default: profile.API_URL || `http://api.${SANDBOX_DOMAIN_NAME}`,
        message: 'Socotra API URL:',
        name: 'API_URL',
      },
      {
        message: 'Tenant hostname:',
        name: 'TENANT_HOSTNAME',
      },
      {
        message: 'Admin username:',
        name: 'ADMIN_USERNAME',
      },
      {
        message: 'Admin password:',
        name: 'ADMIN_PASSWORD',
        type: 'password',
      },
    ])
    const token = await login({ ADMIN_PASSWORD, ADMIN_USERNAME, API_URL, TENANT_HOSTNAME }, 'admin+tenant-ask')
    const get = await _fetch(`${API_URL}/tenant/v1/tenant/config/properties`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    if (!get.ok) {
      throw new Error(await get.text())
    }
    const known = log('before', await get.json())
    const { featureName, isEnabled } = _ask([
      {
        choices: set(known),
        name: 'featureName',
        type: 'choice',
      },
      {
        name: 'isEnabled',
        type: 'confirm',
      },
      {
        message: (t) => {
          return `Please confirm ${TENANT_HOSTNAME}: set ${t.featureName}=${t.isEnabled}`
        },
        name: 'toggleConfirmed',
        type: 'confirm',
      },
    ])
    const res = await _fetch(`${API_URL}/tenant/v1/tenant/config/property`, {
      body: JSON.stringify({
        configProperty: featureName,
        value: Boolean(isEnabled),
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    if (!res.ok) {
      throw new Error(await res.text())
    }
    log('after', await res.json())
  })
*/
