"use client"

import type { IconButtonProps, SpanProps } from "@chakra-ui/react"
import { IconButton, Span, ButtonGroup } from "@chakra-ui/react"
import { ThemeProvider, useTheme } from "next-themes"
import type { ThemeProviderProps } from "next-themes"
import * as React from "react"
import { LuMoon, LuSun } from "react-icons/lu"
import { BsCircleHalf } from "react-icons/bs";
import { Tooltip } from "./ChakraTooltip";

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
  const toggleColorMode = (remove?: boolean) => {
    if(remove) {
      setTheme('system');
      localStorage.removeItem('theme');
    } else {
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
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
  const { toggleColorMode, systemTheme, colorMode, theme } = useColorMode();
  //console.log(`System theme: ${systemTheme} | Theme ${theme} | Color mode ${colorMode}`);
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

  const systemButton = (
    <Tooltip content="Reset theme to system">
    <IconButton
        onClick={() => toggleColorMode(true)}
        variant="ghost"
        aria-label="Use system color mode"
        size="sm"
        ref={ref}
        {...props}
        css={{
          _icon: {
            width: "4",
            height: "4",
          },
        }}
      >
        <BsCircleHalf />
      </IconButton>
      </Tooltip>
  );

    return (
    <ButtonGroup variant="outline" attached>
          {toggleButton}
          {theme !== 'system' ? systemButton : undefined}
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
