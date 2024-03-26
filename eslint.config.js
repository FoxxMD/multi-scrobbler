// @ts-check

import eslint from '@eslint/js';
import tsEslint from 'typescript-eslint';
import arrow from 'eslint-plugin-prefer-arrow-functions';

export default tsEslint.config(
    eslint.configs.recommended,
    ...tsEslint.configs.recommended,
// use to enable typed linting (way more errors) https://typescript-eslint.io/linting/typed-linting
/*    ...tsEslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                project: true,
                tsconfigDirName: import.meta.dirname,
            },
        },
    },*/
    {
        files: ['src/backend/**/*.ts'],
        ignores: ['eslint.config.js'],
        plugins: {
            "prefer-arrow-functions": arrow
        },
        rules: {
            'no-useless-catch': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            "prefer-arrow-functions/prefer-arrow-functions": [
                "warn",
                {
                    "allowNamedFunctions": false,
                    "classPropertiesAllowed": false,
                    "disallowPrototype": false,
                    "returnStyle": "unchanged",
                    "singleReturnOnly": false
                }
            ],
            "arrow-body-style": ["warn", "as-needed"],
            "@typescript-eslint/no-explicit-any": "warn"
        }
    }
);
