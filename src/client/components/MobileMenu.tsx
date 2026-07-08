import {
    IconButton,
    Portal,
    Drawer,
    BreakpointName,
} from "@chakra-ui/react"
import { useState, useEffect, ComponentProps } from 'react';
import { useLocation } from 'react-router';
import { MenuButton, MenuIcon, XIcon } from "./icons/ChakraIcons";
import { NAV_LINKS, SideNavItems } from "./SideNav";

const MobileMenuButton = MenuButton;

export const MobileSidebarNav = (props: { hideFrom?: BreakpointName | false } = {}) => {
    const {
        hideFrom = 'md'
    } = props;
    const [isOpen, setIsOpen] = useState(false);

    let location = useLocation();

    const closeMenu = () => setIsOpen(false)

    const menuButtonProps: ComponentProps<typeof MobileMenuButton> = {
        variant: 'ghost'
    };
    if (hideFrom !== false) {
        menuButtonProps.hideFrom = hideFrom;
    }

    useEffect(() => {
        setIsOpen(false);
    }, [location, setIsOpen])

    return (
        <>
            <Drawer.Root
                open={isOpen}
                placement="start"
                onPointerDownOutside={closeMenu}
                onEscapeKeyDown={closeMenu}
                onOpenChange={(e) => setIsOpen(e.open)}
            >
                <Drawer.Trigger asChild>
                    <MobileMenuButton aria-label="Open menu" {...menuButtonProps}/>
                </Drawer.Trigger>
                <Portal>
                    <Drawer.Backdrop />
                    <Drawer.Positioner>
                        <Drawer.Content borderTopRadius="md" maxH="var(--content-height)">
                            <Drawer.CloseTrigger asChild>
                                <IconButton size="sm" variant="ghost">
                                    <XIcon />
                                </IconButton>
                            </Drawer.CloseTrigger>
                            <Drawer.Body display="flex" flexDir="column" gap="6" py="5" flex="1">
                                <SideNavItems items={NAV_LINKS} />
                            </Drawer.Body>
                        </Drawer.Content>
                    </Drawer.Positioner>
                </Portal>
            </Drawer.Root>
        </>
    )
}