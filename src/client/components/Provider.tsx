"use client"

import { ChakraProvider, defaultSystem } from "@chakra-ui/react"
import {
  ColorModeProvider,
  type ColorModeProviderProps,
} from "./Color-Mode"
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react"
import '../index-next.css';

const queryClient = new QueryClient()

const customConfig = defineConfig({
  globalCss: {
    ".ansi-blue-fg": {
      color: "blue.400"
    },
    ".ansi-red-fg": {
      color: "red.400"
    },
    ".ansi-green-fg": {
      color: "green.400"
    },
    ".ansi-magenta-fg": {
      color: "pink.400"
    },
    ".ansi-yellow-fg": {
      color: "yellow.400"
    },
    ".ansi-cyan-fg": {
      color: "white"
    },
    ".ansi-bright-black-fg": {
      color: "gray.500"
    }
  },
})

export const system = createSystem(defaultConfig, customConfig)

export function Provider(props: ColorModeProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={system}>
        <ColorModeProvider {...props} />
      </ChakraProvider>
      {/* <ReactQueryDevtools /> */}
    </QueryClientProvider>
  )
}