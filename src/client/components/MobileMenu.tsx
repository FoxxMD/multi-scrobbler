import {
    Drawer,
    IconButton,
    Portal,
    Text,
    HStack,
    type BreakpointName,
} from "@chakra-ui/react";
import React, { useEffect, useState, type ComponentProps } from 'react';
import { useLocation } from 'react-router';
import { MenuButton, XIcon } from "./icons/ChakraIcons";
import { NAV_LINKS, SideNavItems } from "./SideNav";
import { useHasAccess } from "../auth/authClient";
import { AuthName } from "./auth/Auth";

const MobileMenuButton = MenuButton;

export const MobileSidebarNav = (props: { hideFrom?: BreakpointName | false } = {}) => {
    const [isOpen, setIsOpen] = useState(false);

    const location = useLocation();

    const closeMenu = () => setIsOpen(false)

    let loggedInName: null | React.JSX.Element = null;
    const {hasAccess} = useHasAccess();
    if (hasAccess) {
        loggedInName = <HStack><Text fontStyle="sm">Logged in as <AuthName fontWeight="bold"/></Text></HStack>
    }

    const menuButtonProps: ComponentProps<typeof MobileMenuButton> = {
        variant: 'ghost',
        iconProps: {
            size: 'lg'
        }
    };

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
                                {loggedInName}
                                <SideNavItems items={NAV_LINKS} currentUrl={location.pathname} />
                            </Drawer.Body>
                        </Drawer.Content>
                    </Drawer.Positioner>
                </Portal>
            </Drawer.Root>
        </>
    )
}