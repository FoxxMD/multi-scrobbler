import { type MenuSelectionDetails, Menu, Group, Portal, type IconButtonProps } from "@chakra-ui/react";
import { EllipsisButton } from "../icons/ChakraIcons";
import { primaryActionProps, type MenuItemRender } from "./menuItemUtils";
import React from "react";

export type menuCallback = (select: MenuSelectionDetails) => void;

export interface PrimaryButtonMenuProps {
    menuCallback: menuCallback,
    primary: React.JSX.Element,
    menuItems: (React.JSX.Element | MenuItemRender)[]
    disabled?: boolean
    menuButtonProps?: IconButtonProps
}

export const PrimaryButtonMenu = (props: PrimaryButtonMenuProps) => {
    let content: React.JSX.Element = props.primary;
    let menuElm: React.JSX.Element | undefined;


    if (props.menuItems.length > 0) {
        menuElm = (
            <Menu.Root positioning={{ placement: "bottom-end" }} onSelect={props.menuCallback}>
                <Group attached>
                    {props.primary}
                    <Menu.Trigger asChild>
                        <EllipsisButton hideBelow="sm" disabled={props.disabled} {...primaryActionProps} {...props.menuButtonProps} />
                    </Menu.Trigger>
                </Group>
                <Portal>
                    <Menu.Positioner>
                        <Menu.Content>
                            {props.menuItems.map((x, i) => {
                                if(React.isValidElement(x)) {
                                    return <React.Fragment key={i}>{x}</React.Fragment>;
                                }
                                return <React.Fragment key={i}>{x({ disabled: props.disabled })}</React.Fragment>
                            })}
                        </Menu.Content>
                    </Menu.Positioner>
                </Portal>
            </Menu.Root>
        );
        content = menuElm;
    }
    return (
        <>{content}</>
    )
}