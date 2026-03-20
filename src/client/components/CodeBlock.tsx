import type { HighlighterGeneric } from "shiki"
import { createShikiAdapter, CodeBlock, IconButton, ClientOnly, ScrollArea } from "@chakra-ui/react"
import { useColorMode } from "./Color-Mode";
import { ComponentProps, PropsWithChildren, useMemo } from "react";
import { safeStringify } from "../../core/StringUtils";
import { MarkOptional } from "ts-essentials";

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

export interface ChakraCodeBaseProps {
  language?: string
  title?: string
  maxHeight?: string
  maxLines?: number
  collapsedMaxHeight?: string
}

export type ChakraCodelessBlock = Omit<ComponentProps<typeof CodeBlock.Root>, 'code'>

export type ChakraCodeBlockProps = Omit<ChakraCodelessBlock, 'children'> & ChakraCodeBaseProps & {
  code: string | object
}

const DEFAULT_MAX_HEIGHT = '70vh',
  DEFAULT_COLLAPSED_MAX_HEIGHT = '320px',
  DEFAULT_LANGUAGE = 'json';

export const ChakraCodeBlock = (props: ChakraCodeBlockProps) => {
  const {
    maxHeight = DEFAULT_MAX_HEIGHT,
    maxLines,
    collapsedMaxHeight = DEFAULT_COLLAPSED_MAX_HEIGHT,
    language = DEFAULT_LANGUAGE,
    code,
    ...rest
  } = props;

  const contentProps: ComponentProps<typeof CodeBlock.Content> = maxLines === undefined ? { maxHeight, overflowY: 'auto' } : { css: { "--code-block-max-height": collapsedMaxHeight } };

  const codeVal = useMemo(() => {
    if (typeof code === 'string') {
      return code;
    }
    return safeStringify(code);
  }, [code]);

  return (
    <CodeBlock.AdapterProvider value={shikiAdapter}>
      <ClientOnly fallback={<div>Loading...</div>}>
        {() => (
          <CodeBlock.Root
            code={codeVal}
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

export const ChakraCodeBlockShort = (props: ChakraCodeBlockProps) => <ChakraCodeBlock maxLines={6} collapsedMaxHeight="10em" hideBelow="sm" {...props} />;

export type ChakraPlainBlockProps = MarkOptional<ChakraCodelessBlock, 'children'> & ChakraCodeBaseProps & {code?: string | object};

export const ChakraPlainBlock = (props: ChakraPlainBlockProps) => {
  const {
    maxHeight = DEFAULT_MAX_HEIGHT,
    maxLines,
    collapsedMaxHeight = DEFAULT_COLLAPSED_MAX_HEIGHT,
    code,
    ...rest
  } = props;

  const contentProps: ComponentProps<typeof CodeBlock.Content> = maxLines === undefined ? { maxHeight, overflowY: 'auto' } : { css: { "--code-block-max-height": collapsedMaxHeight } };

    const codeVal = useMemo(() => {
    if(code === undefined) {
      return ' ';
    }
    if (typeof code === 'string') {
      return code;
    }
    return safeStringify(code);
  }, [code]);

  let header: JSX.Element | null;
  if(props.title === undefined && maxLines === undefined) {
    header = null;
  } else {
    header = (
      <CodeBlock.Header>
        <CodeBlock.Title>{props.title}</CodeBlock.Title>
        <CodeBlock.Control>
          {maxLines !== undefined ? (
             <CodeBlock.CollapseTrigger asChild>
            <IconButton variant="ghost" size="2xs">
              <CodeBlock.CollapseIndicator />
            </IconButton>
          </CodeBlock.CollapseTrigger>
          ) : null}
        </CodeBlock.Control>
      </CodeBlock.Header>
    );
  }

  return (
    <CodeBlock.Root
      code={codeVal}
      language="plaintext"
      maxLines={maxLines}
      {...rest}
    >
      {header}
      <CodeBlock.Content {...contentProps}>
        <CodeBlock.Code>
          {props.children ?? <CodeBlock.CodeText />}
        </CodeBlock.Code>
        <CodeBlock.Overlay>
          <CodeBlock.CollapseTrigger>
            <CodeBlock.CollapseText textStyle="sm" />
          </CodeBlock.CollapseTrigger>
        </CodeBlock.Overlay>
      </CodeBlock.Content>
    </CodeBlock.Root>
  );
}

export const ChakraPlainBlockShort = (props: ChakraPlainBlockProps) => <ChakraPlainBlock maxLines={6} collapsedMaxHeight="10em" hideBelow="sm" {...props} />;