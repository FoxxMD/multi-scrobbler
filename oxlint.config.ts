import { defineConfig } from "oxlint";
import { typeImportRules } from "./oxlint.typeImports.config.ts";

// Migrated from eslint.config.js (eslint10 + typescript-eslint + plugins)
//
// Rules that oxlint implements natively use its built-in plugins (typescript, unicorn, react, oxc).
// Rules oxlint does not implement are loaded from the original eslint plugins through jsPlugins.

// shared between all src files and backend tests
const defaultRules = {
    "no-useless-catch": "off",
    // oxlint's no-unused-vars covers both eslint's and @typescript-eslint's version
    "no-unused-vars": [
        "warn",
        {
            args: "none",
            caughtErrors: "none",
            destructuredArrayIgnorePattern: "^_",
            argsIgnorePattern: "^_",
            ignoreRestSiblings: true,
            ignoreUsingDeclarations: true
        }
    ],
    "arrow-body-style": ["warn", "as-needed"],
    "typescript/no-explicit-any": "warn",
    "typescript/no-empty-object-type": [
        "warn",
        {
            allowInterfaces: "with-single-extends"
        }
    ]
} as const;

const preferArrowFunctions = [
    "warn",
    {
        allowNamedFunctions: false,
        classPropertiesAllowed: false,
        disallowPrototype: false,
        returnStyle: "unchanged",
        singleReturnOnly: false
    }
] as const;

export default defineConfig({
    $schema: "./node_modules/oxlint/configuration_schema.json",
    plugins: [],
    categories: {
        correctness: "off"
    },
    env: {
        builtin: true
    },
    ignorePatterns: [
        "docsite/build",
        "docsite/.astro",
        "public/mockServiceWorker.js",
        "dist"
    ],
    // oxlint does not support settings inside overrides so these live at the top level
    // they are only consumed by eslint-plugin-boundaries (see the boundaries override below)
    settings: {
        "boundaries/elements": [
            { type: "frontend", mode: "file", pattern: "src/client/**/*" },
            { type: "config", mode: "file", pattern: "config/*.example" },
            { type: "core", mode: "file", pattern: ["src/core/!(tests)/**", "src/core/!(tests)"] },
            { type: "core-tests", mode: "file", pattern: ["src/core/tests/**"] },
            { type: "backend", mode: "file", pattern: "src/backend/**/*" },
            { type: "stories", mode: "file", pattern: ["src/stories/**/*", ".storybook/**"] }
        ],
        // So it understands TS path aliases when resolving imports
        "import/resolver": {
            typescript: true
        }
    },
    overrides: [
        {
            files: ["src/**/*.ts", "src/**/*.tsx"],
            plugins: ["typescript", "unicorn", "oxc"],
            jsPlugins: [
                "eslint-plugin-prefer-arrow-functions",
                // oxlint's built-in unicorn plugin does not implement every eslint-plugin-unicorn rule.
                // The real plugin is loaded under an alias (a jsPlugin can't reuse the built-in "unicorn" name)
                // so its rules are referenced as unicorn-js/<rule>
                { name: "unicorn-js", specifier: "eslint-plugin-unicorn" }
            ],
            env: {
                es2026: true,
                node: true
            },
            rules: {
                ...defaultRules,
                "prefer-arrow-functions/prefer-arrow-functions": preferArrowFunctions,

                // Type-only import enforcement
                // IMPORTANT -- see oxlint.typeImports.config.ts for why these exist (verbatimModuleSyntax + frontend bundling)
                ...typeImportRules,

                // equivalent of typescript-eslint "recommended"
                "no-array-constructor": "error",
                "no-unused-expressions": "error",
                "typescript/ban-ts-comment": "error",
                "typescript/no-duplicate-enum-values": "error",
                "typescript/no-extra-non-null-assertion": "error",
                "typescript/no-misused-new": "error",
                "typescript/no-namespace": "error",
                "typescript/no-non-null-asserted-optional-chain": "error",
                "typescript/no-require-imports": "error",
                "typescript/no-this-alias": "error",
                "typescript/no-unnecessary-type-constraint": "error",
                "typescript/no-unsafe-declaration-merging": "error",
                "typescript/no-unsafe-function-type": "error",
                "typescript/no-wrapper-object-types": "error",
                "typescript/prefer-as-const": "error",
                "typescript/prefer-namespace-keyword": "error",
                "typescript/triple-slash-reference": "error",
                "prefer-const": "error",

                // equivalent of eslint "js/recommended"
                "constructor-super": "error",
                "for-direction": "error",
                "getter-return": "error",
                "no-async-promise-executor": "error",
                "no-case-declarations": "error",
                "no-class-assign": "error",
                "no-compare-neg-zero": "error",
                "no-cond-assign": "error",
                "no-const-assign": "error",
                "no-constant-binary-expression": "error",
                "no-constant-condition": "error",
                "no-control-regex": "error",
                "no-debugger": "error",
                "no-delete-var": "error",
                "no-dupe-class-members": "error",
                "no-dupe-else-if": "error",
                "no-dupe-keys": "error",
                "no-duplicate-case": "error",
                "no-empty": "error",
                "no-empty-character-class": "error",
                "no-empty-pattern": "error",
                "no-empty-static-block": "error",
                "no-ex-assign": "error",
                "no-extra-boolean-cast": "error",
                "no-fallthrough": "error",
                "no-func-assign": "error",
                "no-global-assign": "error",
                "no-import-assign": "error",
                "no-invalid-regexp": "error",
                "no-irregular-whitespace": "error",
                "no-loss-of-precision": "error",
                "no-misleading-character-class": "error",
                "no-new-native-nonconstructor": "error",
                "no-nonoctal-decimal-escape": "error",
                "no-obj-calls": "error",
                "no-prototype-builtins": "error",
                "no-redeclare": "error",
                "no-regex-spaces": "error",
                "no-self-assign": "error",
                "no-setter-return": "error",
                "no-shadow-restricted-names": "error",
                "no-sparse-arrays": "error",
                "no-this-before-super": "error",
                "no-unassigned-vars": "error",
                "no-unexpected-multiline": "error",
                "no-unreachable": "error",
                "no-unsafe-finally": "error",
                "no-unsafe-negation": "error",
                "no-unsafe-optional-chaining": "error",
                "no-unused-labels": "error",
                "no-unused-private-class-members": "error",
                // nursery (experimental) in oxlint
                "no-useless-assignment": "error",
                "no-useless-backreference": "error",
                "no-useless-escape": "error",
                "no-with": "error",
                "preserve-caught-error": "error",
                "require-yield": "error",
                "use-isnan": "error",
                "valid-typeof": "error",

                // unicorn -- native in oxlint
                "unicorn/consistent-function-scoping": "warn",
                "unicorn/no-array-callback-reference": "warn",
                "unicorn/new-for-builtins": "error",
                "unicorn/prefer-negative-index": "warn",
                "unicorn/prefer-import-meta-properties": "error",
                "unicorn/prefer-array-flat-map": "warn",
                // replaces unicorn/no-accidental-bitwise-operator, which oxlint does not implement
                "oxc/bad-bitwise-operator": "warn",

                // unicorn -- not implemented in oxlint, run through the real plugin
                "unicorn-js/prefer-then-catch": "error",
                "unicorn-js/consistent-destructuring": "warn",
                "unicorn-js/consistent-optional-chaining": "error",
                "unicorn-js/no-impossible-length-comparison": "error",
                "unicorn-js/no-duplicate-loops": "warn",
                "unicorn-js/no-duplicate-logical-operands": "warn",
                "unicorn-js/no-declarations-before-early-exit": "warn",
                "unicorn-js/prefer-array-from-async": "warn",
                "unicorn-js/no-useless-else": "warn",
                "unicorn-js/no-unused-array-method-return": "error",
                "unicorn-js/prefer-object-destructuring-defaults": "warn"
            }
        },
        {
            // eslint-plugin-react-hooks recommended (react compiler rules), native in oxlint
            files: ["src/client/**/*.tsx"],
            plugins: ["react"],
            env: {
                browser: true
            },
            rules: {
                "react/rules-of-hooks": "error",
                "react/exhaustive-deps": "warn",
                "react/static-components": "error",
                "react/use-memo": "error",
                "react/preserve-manual-memoization": "error",
                "react/incompatible-library": "warn",
                "react/immutability": "error",
                "react/globals": "error",
                "react/refs": "error",
                "react/set-state-in-effect": "error",
                "react/error-boundaries": "error",
                "react/purity": "error",
                "react/set-state-in-render": "error",
                "react/unsupported-syntax": "warn"
            }
        },
        {
            // eslint-plugin-mocha recommended
            files: ["src/backend/tests/**/*.ts"],
            plugins: ["typescript"],
            jsPlugins: ["eslint-plugin-mocha", "eslint-plugin-prefer-arrow-functions"],
            env: {
                mocha: true,
                node: true
            },
            rules: {
                "mocha/consistent-structure": ["error", { disallowDuplicateHooks: true }],
                "mocha/handle-done-callback": "error",
                "mocha/limit-retries": "off",
                "mocha/limit-slow": "off",
                "mocha/limit-timeout": "off",
                "mocha/max-top-level-suites": "off",
                "mocha/no-async-and-done": "error",
                "mocha/no-async-in-sync-tests": "error",
                "mocha/no-async-suite": "error",
                "mocha/no-code-after-done": "error",
                "mocha/no-conditional-tests": "error",
                "mocha/no-done-twice": "error",
                "mocha/no-exclusive-tests": "warn",
                "mocha/no-exports": "error",
                "mocha/no-top-level-tests": "error",
                "mocha/no-hooks": "off",
                "mocha/no-hooks-for-single-child": "off",
                "mocha/no-identical-title": "error",
                "mocha/no-mocha-arrows": "error",
                "mocha/no-nested-suites": "off",
                "mocha/no-nested-tests": "error",
                "mocha/no-pending-tests": "warn",
                "mocha/no-return-and-done": "error",
                "mocha/no-return-from-async": "off",
                "mocha/no-setup-in-suite": "off",
                "mocha/no-synchronous-tests": "off",
                "mocha/no-root-hooks": "off",
                "mocha/prefer-arrow-callback": "off",
                "mocha/valid-suite-title": "off",
                "mocha/valid-test-title": "off",
                "mocha/no-empty-title": "error",
                "mocha/consistent-spacing-between-blocks": "off",
                "mocha/consistent-interface": "off",
                ...defaultRules,
                "prefer-arrow-functions/prefer-arrow-functions": ["off"],
                "no-unused-expressions": "off"
            }
        },
        {
            files: ["**/*.{ts,tsx,mts,cts}"],
            jsPlugins: ["eslint-plugin-unused-imports"],
            rules: {
                "unused-imports/no-unused-imports": "error"
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
        //
        // element definitions are in top-level settings['boundaries/elements']
        {
            files: ["src/**/*.{ts,tsx}"],
            jsPlugins: ["eslint-plugin-boundaries"],
            rules: {
                "boundaries/element-types": [
                    "warn",
                    {
                        default: "disallow", // deny anything not explicitly allowed
                        rules: [
                            {
                                from: "frontend",
                                allow: ["frontend", "core"] // frontend can use itself + core, never backend
                            },
                            {
                                from: "core",
                                allow: ["core"] // core can only use itself — never backend, never frontend
                            },
                            {
                                from: "backend",
                                allow: ["backend", "core", "config", "core-tests"] // backend can use itself + core + tests
                            },
                            {
                                from: "stories",
                                allow: ["stories", "core", "frontend", "core-tests"]
                            },
                            {
                                from: "core-tests",
                                allow: ["core", "core-tests"]
                            }
                        ]
                    }
                ],
                // flag any file under src/ that doesn't match one of the element patterns (catches stray/misplaced files)
                "boundaries/no-unknown": "warn"
            }
        }
    ]
});
