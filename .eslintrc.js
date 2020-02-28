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
       ]
    }
};
