module.exports = {
    "env": {
        "browser": false,
        "node": true,
        "commonjs": true,
        "es6": true
    },
    "extends": "eslint:recommended",
    "globals": {
        "Atomics": "readonly",
        "SharedArrayBuffer": "readonly"
    },
    "parserOptions": {
        "ecmaVersion": 2018
    },
    "rules": {
       "indent": [
          "error", 2, {
             "VariableDeclarator": { "var": 2, "let": 2, "const": 3 },
             "ObjectExpression": "first",
             "ArrayExpression": "first",
             "SwitchCase": 1,
          },
       ], // indent
       "default-case": [ "error" ],  // add `// no default` instead of default:... to skip
       "no-fallthrough": [ "error" ], // add `// fall through` after statement to skip this check

       "no-setter-return": [ "warn" ],
       "no-import-assign": [ "warn" ],
       "no-dupe-else-if": [ "error" ],
       "no-template-curly-in-string": [ "error" ],
       "array-callback-return": [ "warn" ],
       "dot-notation": [ "warn" ],
       "no-constructor-return": [ "warn" ],
       "no-eq-null": [ "error" ],
       "no-extra-bind": [ "warn" ],

       "no-new-wrappers": [ "error" ],
       "no-throw-literal": [ "error" ],
       "no-unmodified-loop-condition": [ "warn" ],
    }
};
