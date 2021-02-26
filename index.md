Ready to deploy to a Socotra sandbox tenant? Give this a try:

````
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

The difference between `npx @socotra/jwt` and `npx github:socotra/jwt#main` is whether it uses
1. the latest version in NPM's registry
2. GitHub's `main` branch version

When you've got your credentials ready, run: `npx github:socotra/jwt#main login`
