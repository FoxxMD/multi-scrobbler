import type { HighlighterGeneric } from "shiki"
import { createShikiAdapter, CodeBlock, IconButton, ClientOnly, ScrollArea } from "@chakra-ui/react"
import { useColorMode } from "./Color-Mode";
import { ComponentProps } from "react";

const shikiAdapter = createShikiAdapter<HighlighterGeneric<any, any>>({
  async load() {
    const { createHighlighter } = await import("shiki")
    return createHighlighter({
      langs: ["json", "plaintext"],
      themes: ["github-dark", "github-light"],
    })
  },
  theme: {
    light: "github-light",
    dark: "github-dark",
  },
});

export type ChakraCodeBlockProps = Omit<ComponentProps<typeof CodeBlock.Root>, 'children'> & {
  code: string
  language?: string
  title?: string
  maxHeight?: string
  maxLines?: number
  collapsedMaxHeight?: string
}

export const ChakraCodeBlock = (props: ChakraCodeBlockProps) => {
  const {
    maxHeight = '70vh',
    maxLines,
    collapsedMaxHeight = '320px',
    language = 'json',
    ...rest
  } = props;

  const contentProps: ComponentProps<typeof CodeBlock.Content> = maxLines === undefined ? { maxHeight, overflowY: 'auto' } : { css: {"--code-block-max-height": collapsedMaxHeight}};

  return (
    <CodeBlock.AdapterProvider value={shikiAdapter}>
      <ClientOnly fallback={<div>Loading...</div>}>
        {() => (
          <CodeBlock.Root 
          code={props.code} 
          language={language ?? 'json'} 
          maxLines={maxLines}
          meta={{ wordWrap: true }}
          {...rest}
          >
            <CodeBlock.Header>
              <CodeBlock.Title>{props.title ?? ' '}</CodeBlock.Title>
              <CodeBlock.Control>
                <CodeBlock.CollapseTrigger asChild>
                  <IconButton variant="ghost" size="2xs">
                    <CodeBlock.CollapseIndicator />
                  </IconButton>
                </CodeBlock.CollapseTrigger>
                <CodeBlock.CopyTrigger asChild>
                  <IconButton variant="ghost" size="2xs">
                    <CodeBlock.CopyIndicator />
                  </IconButton>
                </CodeBlock.CopyTrigger>
              </CodeBlock.Control>
            </CodeBlock.Header>
            <CodeBlock.Content {...contentProps}>
              <CodeBlock.Code>
                <CodeBlock.CodeText />
              </CodeBlock.Code>
              
              <CodeBlock.Overlay>
            <CodeBlock.CollapseTrigger>
              <CodeBlock.CollapseText textStyle="sm" />
            </CodeBlock.CollapseTrigger>
          </CodeBlock.Overlay>
            </CodeBlock.Content>
          </CodeBlock.Root>
        )}
      </ClientOnly>
    </CodeBlock.AdapterProvider>
  )
}