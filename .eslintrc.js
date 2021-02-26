/* eslint-env node */
module.exports = {
  env: {
    es2020: true,
    node: true,
  },

  extends: [
    'eslint:recommended',
    'plugin:import/recommended',
    'plugin:node/recommended',
    'plugin:prettier/recommended',
    'prettier',
  ],

  parserOptions: {
    ecmaVersion: 2020,
  },

  plugins: ['import', 'node', 'prettier'],

  root: true,

  rules: {
    'sort-keys': 'warn',
  },
}
