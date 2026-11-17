import { defineConfig } from "oxlint";

// Type-only import enforcement
//
// WHY THIS EXISTS
//
// tsconfig.json uses `verbatimModuleSyntax: true`. We need it for nodejs type stripping compatibility
// (node runs our .ts files directly and just erases type syntax, it does not do whole-program analysis).
//
// With verbatimModuleSyntax, TS (and node) only erase an import when it is *explicitly* marked type-only.
// It never looks at whether an imported name is actually used as a value. So:
//
//   import type { Foo, Bar } from 'a';      => erased entirely, module 'a' is never loaded
//   import { type Foo, baz } from 'a';      => becomes import { baz } from 'a'      (fine, we need 'a' for baz anyway)
//   import { type Foo, type Bar } from 'a'; => becomes import {} from 'a'           (!!! 'a' is STILL loaded at runtime)
//   import { Foo } from 'a';                => kept as-is, 'a' is loaded even though Foo is only a type
//
// The last two are the dangerous ones. Frontend (client) code is allowed to use types from backend/core,
// but if the import isn't erased then vite follows it and bundles server-side modules (and their server-only packages)
// into the frontend, directly or transitively through core. On the backend it means loading modules (and running
// their side effects) that were only needed for types.
//
// So it's important that type-only imports are always written as top-level `import type` statements.
// Mixed type/value imports are fine, since the module has to be loaded for the value anyway.
//
// HOW IT IS ENFORCED
//
// * typescript/consistent-type-imports -- flags imported names that are only used as types but not marked `type`.
//     fixStyle 'inline-type-imports' fixes  import { Foo, baz }  =>  import { type Foo, baz }  (mixed import, fine)
//     If *every* name is only used as a type it fixes to a top-level  import type { Foo }
//
// * typescript/no-import-type-side-effects -- flags the  import { type Foo, type Bar }  case (every specifier is inline type)
//     and fixes it to  import type { Foo, Bar }
//
// (In eslint this was attempted with @typescript-eslint/consistent-type-imports + 'separate-type-imports', which detected
// the problem but never moved inline => top-level, and the plugin-import rule that would have, consistent-type-specifier-style,
// did not support eslint10. That rule is also stricter than we want -- it forbids mixed imports.)
//
// FIXING
//
// `npm run lint:fix:type-imports` uses THIS FILE as its oxlint config, so only these rules are fixed and nothing else
// in the codebase gets touched.
//
// It needs BOTH --fix and --fix-suggestions:
//   * consistent-type-imports' fix is a "safe" fix (only --fix applies it)
//   * no-import-type-side-effects' fix is a "suggestion" (only --fix-suggestions applies it)
//
// and it runs the fix TWICE:
//   oxlint fixes an import where every name is only used as a type,  import { Foo, Bar }, to the inline
//   import { type Foo, type Bar }  (the exact thing we don't want). That result is then fixed to  import type { Foo, Bar }
//   by no-import-type-side-effects, but oxlint does not re-lint its own fixes within a single run, so it takes a second pass.
//
// The script finishes with a plain (no fix) run so it exits non-zero if anything is still left unfixed.

export const typeImportRules = {
    "typescript/consistent-type-imports": [
        "error",
        {
            prefer: "type-imports",
            fixStyle: "inline-type-imports"
        }
    ],
    "typescript/no-import-type-side-effects": "error"
} as const;

// Standalone config used only by `npm run lint:fix:type-imports`
// The main config (oxlint.config.ts) imports typeImportRules from this file instead
export default defineConfig({
    plugins: ["typescript"],
    categories: {
        correctness: "off"
    },
    rules: {
        ...typeImportRules
    }
});
