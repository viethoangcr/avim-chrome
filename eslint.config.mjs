import globals from 'globals';

const avimGlobals = {
  AVIMObj: 'writable',
  AVIM: 'writable',
  method: 'writable',
  onOff: 'writable',
  checkSpell: 'writable',
  oldAccent: 'writable',
  exclude: 'writable',
  fromCharCode: 'readonly',
  checkCode: 'readonly',
  upperCase: 'readonly',
  start: 'readonly',
  ifMoz: 'readonly',
  _range: 'writable',
  AVIMTransport: 'readonly',
  WeakMap: 'readonly'
};

export default [
  {
    ignores: ['build/**', 'dist/**', 'node_modules/**', 'src/scripts/avim.js']
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: 'readonly',
        ...avimGlobals
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none' }]
    }
  },
  {
    files: ['scripts/**/*.mjs', 'test/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
        ...avimGlobals
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none' }]
    }
  }
];
