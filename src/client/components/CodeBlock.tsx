import type { HighlighterGeneric } from "shiki"
import { createShikiAdapter, CodeBlock, IconButton, ClientOnly } from "@chakra-ui/react"
import { useColorMode } from "./Color-Mode";

const shikiAdapter = createShikiAdapter<HighlighterGeneric<any, any>>({
  async load() {
    const { createHighlighter } = await import("shiki")
    return createHighlighter({
      langs: ["json"],
      themes: ["github-dark", "github-light"],
    })
  },
  theme: {
    light: "github-light",
    dark: "github-dark",
  },
});

export interface ChakraCodeBlockProps {
  code: string
  language?: string
  title?: string
}

export const ChakraCodeBlock = (props: ChakraCodeBlockProps) => {
  return (
    <CodeBlock.AdapterProvider value={shikiAdapter}>
      <ClientOnly fallback={<div>Loading...</div>}>
        {() => (
          <CodeBlock.Root code={props.code} language={props.language ?? 'json'}>
            <CodeBlock.Header>
              <CodeBlock.Title>{props.title ?? ' '}</CodeBlock.Title>
              <CodeBlock.CopyTrigger asChild>
                <IconButton variant="ghost" size="2xs">
                  <CodeBlock.CopyIndicator />
                </IconButton>
              </CodeBlock.CopyTrigger>
            </CodeBlock.Header>
            <CodeBlock.Content>
              <CodeBlock.Code>
                <CodeBlock.CodeText />
              </CodeBlock.Code>
            </CodeBlock.Content>
          </CodeBlock.Root>
        )}
      </ClientOnly>
    </CodeBlock.AdapterProvider>
  )
}