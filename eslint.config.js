// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import { defineConfig, globalIgnores } from "eslint/config";

// @ts-check

import js from '@eslint/js';
import globals from 'globals';
import tsEslint from 'typescript-eslint';
import arrow from 'eslint-plugin-prefer-arrow-functions';
import hooks from 'eslint-plugin-react-hooks';
import mochaPlugin from 'eslint-plugin-mocha';

const defaultRules = {
    'no-useless-catch': 'off',
    '@typescript-eslint/no-unused-vars': 'warn',
    'no-unused-vars': 'warn',
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
};

export default defineConfig([
    globalIgnores([
        'docsite/build',
        'docsite/.docusaurus',
        'public/mockServiceWorker.js'
    ]),
    {
        plugins: {
            "prefer-arrow-functions": arrow,
            js
        },
        rules: defaultRules,
        extends: [
            tsEslint.configs.recommended,
            "js/recommended"
        ],
        languageOptions: {
            globals: {
                ...globals.node,
            }
        },
        files: ['src/**/*.ts','src/**/*.tsx']
    },
    {
        extends: [
            storybook.configs["flat/recommended"],
        ],
        files: ['src/client/stories/**/*.tsx'],
    },
    {
        extends: [
            hooks.configs.flat.recommended,
        ],
        languageOptions: {
            globals: {
                ...globals.browser,
            }
        },
        files: ['src/client/**/*.tsx'],
    },
    {
        extends: [
            mochaPlugin.configs.recommended,
        ],
        languageOptions: {
            globals: {
                ...globals.node,
            }
        },
        files: ['src/backend/tests/**/*.ts'],
        rules: {
            ...defaultRules,
                "prefer-arrow-functions/prefer-arrow-functions": ["off"],
                "@typescript-eslint/no-unused-expressions": 'off',
                'mocha/max-top-level-suites': 'off'
        },
    }
]);