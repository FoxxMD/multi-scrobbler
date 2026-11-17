import { defineConfig } from "oxlint";

// Unused import removal
//
// unused-imports/no-unused-imports comes from eslint-plugin-unused-imports (loaded as a jsPlugin).
// It only reports *imports*, so it is safe to auto-fix: unused variables/args are left for no-unused-vars (warn only, never auto-fixed).
//
// FIXING
//
// `npm run lint:fix:unused-imports` uses THIS FILE as its oxlint config, so only this rule is fixed and nothing else
// in the codebase gets touched.
//
// It runs the fix TWICE:
//   for an import with an unused default AND unused named specifiers, EX  import def, { type Foo } from 'a'
//   the first pass only removes the default ( import { type Foo } from 'a' ) and oxlint does not re-lint its own fixes
//   within a single run, so it takes a second pass to remove the rest.
//
// The script finishes with a plain (no fix) run so it exits non-zero if anything is still left unfixed.

export const unusedImportsJsPlugins = ["eslint-plugin-unused-imports"];

export const unusedImportsRules = {
    "unused-imports/no-unused-imports": "error"
} as const;

// Standalone config used only by `npm run lint:fix:unused-imports`
// The main config (oxlint.config.ts) imports unusedImportsJsPlugins/unusedImportsRules from this file instead
export default defineConfig({
    plugins: [],
    categories: {
        correctness: "off"
    },
    jsPlugins: unusedImportsJsPlugins,
    rules: {
        ...unusedImportsRules
    }
});
