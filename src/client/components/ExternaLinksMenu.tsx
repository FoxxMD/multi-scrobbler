import { Box, Button, Menu, Portal } from "@chakra-ui/react"
import { type ComponentProps } from "react"
import { ExternalLinkIcon } from "./icons/ChakraIcons"
import { EXTERNAL_LINKS } from "./SideNav"


export const ExternaLinksMenu = (props: ComponentProps<typeof Box> = {}) => (
    <Box {...props}>
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button size="sm" variant="ghost">
          Links
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            {EXTERNAL_LINKS.items.map((link) => (
              <Menu.Item key={link.url} asChild value={link.title} cursor="pointer">
                <a href={link.url} target="_blank" rel="noreferrer">
                  {link.title} <ExternalLinkIcon />
                </a>
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
    </Box>
  )