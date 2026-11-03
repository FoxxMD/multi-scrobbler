"use client"

import { ChakraProvider, createSystem, defaultConfig, defineConfig, defineSlotRecipe } from "@chakra-ui/react"
import { timelineAnatomy } from "@chakra-ui/react/anatomy";
import {
  MutationCache,
  QueryClient,
  QueryClientProvider
} from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { toaster } from './Toaster'
import '../index.css'
import {
  ColorModeProvider,
  type ColorModeProviderProps,
} from "./Color-Mode"

const timelineSlotRecipe = defineSlotRecipe({
    slots: timelineAnatomy.keys(),
    base: {
        item: {
          "--timeline-content-gap": "spacing.5"  // was spacing.6
        }
    }
});

const queryClient = new QueryClient({
  // surface auth failures from any dashboard action in one place
  mutationCache: new MutationCache({
    onError: (error) => {
      if (!(error instanceof HTTPError)) {
        return;
      }
      const code = (error.data as {code?: string} | undefined)?.code;
      if (error.response.status === 401 && code === 'auth_required') {
        toaster.create({type: 'error', title: 'Log in required', description: 'Log in to make changes on this instance.'});
      } else if (error.response.status === 403 && code === 'unsecured_read_only') {
        toaster.create({type: 'error', title: 'Read-only', description: (error.data as {error?: string}).error});
      }
    }
  })
})

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
  theme: {
    slotRecipes: {
      timeline: timelineSlotRecipe
    }
  }
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