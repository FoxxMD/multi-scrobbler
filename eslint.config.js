// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";
import boundaries from 'eslint-plugin-boundaries';
import unusedImports from 'eslint-plugin-unused-imports';

import { defineConfig, globalIgnores } from "eslint/config";

// @ts-check

import js from '@eslint/js';
import globals from 'globals';
import tsEslint from 'typescript-eslint';
import arrow from 'eslint-plugin-prefer-arrow-functions';
import hooks from 'eslint-plugin-react-hooks';
import mochaPlugin from 'eslint-plugin-mocha';
import unicorn from 'eslint-plugin-unicorn';

const defaultRules = {
    'no-useless-catch': 'off',
    '@typescript-eslint/no-unused-vars': 'warn',
    'no-unused-vars': [
        'warn',
        {
            args: 'none',
            caughtErrors: 'none',
            destructuredArrayIgnorePattern: "^_",
            "argsIgnorePattern": "^_",
            ignoreRestSiblings: true,
            ignoreUsingDeclarations: true
        }
    ],
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        args: 'none',
        caughtErrors: 'none',
        destructuredArrayIgnorePattern: "^_",
        "argsIgnorePattern": "^_",
        ignoreRestSiblings: true,
        ignoreUsingDeclarations: true
      }
    ],
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
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-empty-object-type": [
        "warn",
        {
            "allowInterfaces": 'with-single-extends'
        }
    ]
};

export default defineConfig([
    globalIgnores([
        'docsite/build',
        'docsite/.docusaurus',
        'public/mockServiceWorker.js',
        'dist'
    ]),
    {
        plugins: {
            "prefer-arrow-functions": arrow,
            js,
            'unused-imports': unusedImports,
            unicorn,
        },
        rules: {
            ...defaultRules,
            // https://typescript-eslint.io/rules/consistent-type-imports/#comparison-with-importsnotusedasvalues--verbatimmodulesyntax
            //
            // when using tsconfig compiler verbatimModuleSyntax and EX import {type Foo, type Bar} from 'a';
            // true => typescript will *still* import a module if all types are inline  
            // false => typescript will erase the entire module import
            //
            // we need to use verbatimModuleSyntax: true for nodejs type stripping compatibility so
            // its important that we use top-level type imports so we don't accidentally import server-side modules into frontend
            // but can still use types where necessary
            //
            // this rule *should* do this...it does detect imports that are typed but not explicitly declared
            // but its not moving inline -> top-level
            "@typescript-eslint/consistent-type-imports": [
                "error",
                {
                    prefer: 'type-imports',
                    fixStyle: "separate-type-imports"
                }
            ],
            // however, import/consistent-type-specifier-style from eslint-plugin-import *does* move inline => top-level
            // but it does not yet support eslint10 :(
            //
            // TODO eventually add this once plugin-import supports eslint10
            // https://github.com/import-js/eslint-plugin-import
            // https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/consistent-type-specifier-style.md
            // -- this enforces that type-only imports are fixed to top-level type imports IE
            // import {type Foo, type Bar} from 'a'; => import type { Foo, Bar} from 'a';
            // "import/consistent-type-specifier-style": [
            //     "error", "prefer-top-level-if-only-type-imports"
            // ]
            "unicorn/prefer-then-catch": "error",
            "unicorn/consistent-destructuring": "warn",
            "unicorn/consistent-function-scoping": "warn",
            "unicorn/consistent-optional-chaining": "error",
            "unicorn/no-array-callback-reference": "warn",
            "unicorn/no-accidental-bitwise-operator": "warn",
            "no-obj-calls": "error",
            "unicorn/new-for-builtins": "error",
            "unicorn/no-impossible-length-comparison": "error",
            "unicorn/no-duplicate-loops": "warn",
            "unicorn/no-duplicate-logical-operands": "warn",
            "unicorn/no-declarations-before-early-exit": "warn",
            "unicorn/prefer-negative-index": "warn",
            "unicorn/prefer-import-meta-properties": "error",
            "unicorn/prefer-array-from-async": "warn",
            "unicorn/prefer-array-flat-map": "warn",
            "unicorn/no-useless-else": "warn",
            "unicorn/no-unused-array-method-return": "error",
            //"unicorn/no-unreadable-object-destructuring": "warn",
            "unicorn/prefer-object-destructuring-defaults": "warn"
        },
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
        plugins: {
            'unused-imports': unusedImports
        },
        rules: {
            'no-undef': 'off',
            'unused-imports/no-unused-imports': 'error'
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
            { type: 'core', mode: 'file', pattern: ['src/core/!(tests)/**','src/core/!(tests)'] },
            { type: 'core-tests', mode: 'file', pattern: ['src/core/tests/**'] },
            { type: 'backend', mode: 'file', pattern: 'src/backend/**/*' },
            { type: 'stories', mode: 'file', pattern: ['src/stories/**/*', '.storybook/**'] },
        ],
        // So it understands TS path aliases when resolving imports
        'import/resolver': {
            typescript: true,
        },
        },
        rules: {
        'boundaries/element-types': [
            'warn',
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
                allow: ['backend', 'core', 'config', 'core-tests'], // backend can use itself + core + tests
                },
                {
                from: 'stories',
                allow: ['stories', 'core', 'frontend', 'core-tests'], // backend can use itself + core
                },
                {
                from: 'core-tests',
                allow: ['core', 'core-tests'], // backend can use itself + core
                },
            ],
            },
        ],
        // Optional: flag any file under src/ that doesn't match one of the
        // three element patterns above (catches stray/misplaced files)
        'boundaries/no-unknown': 'warn'
        },
    }
]);