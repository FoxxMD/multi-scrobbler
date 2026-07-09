import { createShikiAdapter } from "@chakra-ui/react"
import type { HighlighterGeneric } from "shiki"
import { createHighlighterCore } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
//import json from '@shikijs/langs/json';
// import githubDark from '@shikijs/themes/github-dark';
// import githubLight from '@shikijs/themes/github-light';
//import engine from 'shiki/wasm';

let highlighterSingleton: HighlighterGeneric<any, any>;

export const shikiAdapter = createShikiAdapter<HighlighterGeneric<any, any>>({
  load: async () => {
    if (highlighterSingleton == undefined) {
      highlighterSingleton = await createHighlighterCore({
        themes
          : [
            // or a dynamic import if you want to do chunk splitting
            import('@shikijs/themes/github-dark'),
            import('@shikijs/themes/github-light')
          ],
        langs
          : [
            //json,
            // shiki will try to interop the module with the default export
            () => import('@shikijs/langs/json'),
          ],
        // `shiki/wasm` contains the wasm binary inlined as base64 string.
        engine: createOnigurumaEngine(import('shiki/wasm'))
      });
    }

    return highlighterSingleton;

    // const { createHighlighter } = await import("shiki")
    // return createHighlighter({
    //   langs: ["json", "plaintext"],
    //   themes: ["github-dark", "github-light"],
    // })
  },
  theme: {
    light: "github-light",
    dark: "github-dark",
  },
});