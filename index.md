Welcome! Deploy [your playground](https://studio.sandbox.socotra.com) tenant in Socotra's `sandbox` env, then give this a try:

```
$ npx github:socotra/jwt#main help
Usage: npx @socotra/jwt [options] <command> [args] # see: ... help <command>

Options:
  -d, --debug                enable DEBUG=* logging
  -v, --verbose              enable verbose output
  -V, --version              print CLI version
  -h, --help                 display help for command

Commands:
  inspect [options] [token]
  login [options] [env]
  help [command]             display help for command
```

The difference between `npx @socotra/jwt` and `npx github:socotra/jwt#main` is whether:
1. to use the [published version](https://www.npmjs.com/package/@socotra/jwt) (or local cache, pulled from NPM's default registry)
2. or, use GitHub's `main` [branch version](https://github.com/socotra/jwt/tree/main) (latest code, will prompt for confirmation)

## Quick Start

If you haven't already deployed a playground tenant, use your [evaluation credentials](https://docs.socotra.com/production/configuration/gsg.html) and then:

To acquire a token for your `alice.lee` test user: `npx github:socotra/jwt#main login --tenant=$TENANT_HOSTNAME`

(where `TENANT_HOSTNAME` is: `$ADMIN_USERNAME-configeditor.co.sandbox.socotra.com` by default)

## Troubleshooting

Missing npx? [NodeJS](https://nodejs.org) comes bundled with the `npm` and `npx` tools.

On macOS, with [Brew](https://brew.sh) you can just: `brew install nodejs` to provide `npx`

File an issue (bug) or pull request (fix) on GitHub if you would like to contribute. Thanks!
