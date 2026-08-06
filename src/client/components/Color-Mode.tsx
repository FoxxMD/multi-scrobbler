"use client"

import type { IconButtonProps, SpanProps } from "@chakra-ui/react"
import { IconButton, Span, ButtonGroup } from "@chakra-ui/react"
import { ThemeProvider, useTheme } from "next-themes"
import type { ThemeProviderProps } from "next-themes"
import * as React from "react"
import { LuMoon, LuSun } from "react-icons/lu"

export interface ColorModeProviderProps extends ThemeProviderProps {}

export const ColorModeProvider = (props: ColorModeProviderProps) => <ThemeProvider attribute="class"  defaultTheme="system" {...props} />;

export type ColorMode = "light" | "dark"

export interface UseColorModeReturn {
  colorMode: ColorMode
  setColorMode: (colorMode: ColorMode) => void
  toggleColorMode: (remove?: boolean) => void
  systemTheme: ColorMode | undefined
  theme?: string
}

export const useColorMode = (): UseColorModeReturn => {
  const { resolvedTheme, setTheme, forcedTheme, systemTheme, theme } = useTheme()
  const colorMode = forcedTheme || resolvedTheme
  //console.log(`Use Color Mode -- system theme: ${systemTheme} | Used Theme ${theme} | Color mode ${colorMode}`);
  const toggleColorMode = () => {
    // https://lea.verou.me/blog/2026/dark-mode-toggles/#good-two-state-ux
    // only change override (or remove) if *user* initiated
    // dont do anything if system theme changes

    const inverseTheme = resolvedTheme === 'dark' ? 'light' : 'dark';

    // if user-initiated toggle
    //
    // and is going back to system theme
    if(systemTheme === inverseTheme) {
      // then remove override
      setTheme('system');
      localStorage.removeItem('theme');
      console.debug('removed theme override');
    } else {
      // otherwise, going to non-system theme
      // add override
      setTheme(inverseTheme);
      console.debug(`setting theme override to ${inverseTheme}`);
    }
  }
  return {
    colorMode: colorMode as ColorMode,
    setColorMode: setTheme,
    toggleColorMode,
    systemTheme,
    theme
  }
};

export const useColorModeValue = <T,>(light: T, dark: T) => {
  const { colorMode } = useColorMode()
  return colorMode === "dark" ? dark : light
};

export const ColorModeIcon = () => {
  const { colorMode } = useColorMode()
  return colorMode === "dark" ? <LuMoon /> : <LuSun />
};

interface ColorModeButtonProps extends Omit<IconButtonProps, "aria-label"> {}

export const ColorModeButton = React.forwardRef<
  HTMLButtonElement,
  ColorModeButtonProps
>((props, ref) => {
  const { toggleColorMode } = useColorMode();
  const toggleButton = (
  <IconButton
        onClick={() => toggleColorMode()}
        variant="ghost"
        aria-label="Toggle color mode"
        size="sm"
        ref={ref}
        {...props}
        css={{
          _icon: {
            width: "5",
            height: "5",
          },
        }}
      >
        <ColorModeIcon />
      </IconButton>
      );

    return (
    <ButtonGroup variant="outline" attached>
          {toggleButton}
        </ButtonGroup>
  )
});

export const LightMode = React.forwardRef<HTMLSpanElement, SpanProps>(
  (props, ref) => <Span
        color="fg"
        display="contents"
        className="chakra-theme light"
        colorPalette="gray"
        colorScheme="light"
        ref={ref}
        {...props}
      />,
)

export const DarkMode = React.forwardRef<HTMLSpanElement, SpanProps>(
  (props, ref) => <Span
        color="fg"
        display="contents"
        className="chakra-theme dark"
        colorPalette="gray"
        colorScheme="dark"
        ref={ref}
        {...props}
      />,
)
