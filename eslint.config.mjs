import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'src/**/*', 'server/**/*', '*.ts', '*.tsx', '*.mjs', '*.js'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
