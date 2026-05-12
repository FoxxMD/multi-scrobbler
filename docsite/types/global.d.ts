import * as React from 'react'

/**
 * React 19 removed the JSX namespace
 * https://react.dev/blog/2024/04/25/react-19-upgrade-guide#the-jsx-namespace-in-typescript
 * and any packages that still use it will produce ts warnings/errors
 * 
 * this can be bypassed by using tsconfig's compilerOptions.skipLibCheck: true
 * but that is not super great for detecting actual issues with third party libraries before compile time
 * 
 * Some of the below may be fixed by upgrading docusaurus to 3.10.x but for now:
 * 
 * * hast-util-to-jsx-runtime version had to be overriden to use a newer package to fix NS issue
 * * packages below have no newer version with fixed NS so we just provide global overrides to re-export React as JSX NS
 * 
 */

// https://github.com/mdx-js/mdx/issues/2487#issuecomment-3462720757
declare module 'mdx/types.js' {
  export import JSX = React.JSX
}

declare module 'react-helmet-async' {
  export import JSX = React.JSX
}

export {}