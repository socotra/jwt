Welcome! Deploy [your playground](https://studio.sandbox.socotra.com) tenant in Socotra's sandbox, then give this a try:

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

The difference between `npx @socotra/jwt` and `npx github:socotra/jwt#main` is whether
1. it'll use the latest local version (if cached, else: from default=NPM registry)
2. GitHub's `main` branch version (will prompt for confirmation first)

Got your Socotra credentials ready?

Run: `npx github:socotra/jwt#main login --tenant=$TENANT_HOSTNAME`

Where `TENANT_HOSTNAME` is: `$ADMIN_USERNAME-configeditor.co.sandbox.socotra.com`

The default configuration names a test user named `alice.lee` with password: `socotra`

## Troubleshooting

Missing npx? [NodeJS](https://nodejs.org) comes bundled with the `npm` and `npx` tools.

On macOS, with [Brew](https://brew.sh) you can just: `brew install nodejs` to provide `npx`

File an issue (bug) or pull request (fix) on GitHub if you would like to contribute. Thanks!
