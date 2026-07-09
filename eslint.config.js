// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";
import boundaries from 'eslint-plugin-boundaries';

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
    },
    {
        // https://typescript-eslint.io/troubleshooting/faqs/eslint#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
        files: ['**/*.{ts,tsx,mts,cts}'],
        rules: {
        'no-undef': 'off',
        }
    }, 
    // this ruleset helps keep backend, frontend, and core keep imports isolated
    // in order to prevent frontend (vite) from accidentally bundling backend files + backend packages when importing directly (backend) or transitively (through core)
    //
    // folder (module?) boundaries should be like
    //
    // backend <-- all node/server side code
    // core <-- shared types, utils, and logic between backend and client
    // client <-- frontend code to be bundled by vite, SHOULD NOT import directly/transitively from backend
    {
        files: ['src/**/*.{ts,tsx}'],
        plugins: { boundaries },
        settings: {
        // Define your three architectural layers
        'boundaries/elements': [
            { type: 'frontend', mode: 'file', pattern: 'src/client/**/*' },
            { type: 'config', mode: 'file', pattern: 'config/*.example' },
            { type: 'core', mode: 'file', pattern: 'src/core/**/*' },
            { type: 'backend', mode: 'file', pattern: 'src/backend/**/*' },
        ],
        // So it understands TS path aliases when resolving imports
        'import/resolver': {
            typescript: true,
        },
        },
        rules: {
        'boundaries/element-types': [
            'error',
            {
            default: 'disallow', // deny anything not explicitly allowed
            rules: [
                {
                from: 'frontend',
                allow: ['frontend', 'core'], // frontend can use itself + core, never backend
                },
                {
                from: 'core',
                allow: ['core'], // core can only use itself — never backend, never frontend
                },
                {
                from: 'backend',
                allow: ['backend', 'core', 'config'], // backend can use itself + core
                },
            ],
            },
        ],
        // Optional: flag any file under src/ that doesn't match one of the
        // three element patterns above (catches stray/misplaced files)
        'boundaries/no-unknown': 'error',
        },
    }
]);