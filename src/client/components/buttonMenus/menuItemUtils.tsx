import {Menu, Box, type MenuItemProps, type IconButtonProps} from '@chakra-ui/react';
import { capitalize } from '../../../core/StringUtils';
import type { IconType } from 'react-icons/lib';
import type React from 'react';

export const menuItem = (Icon: IconType, value: string, name?: string) => (props: Omit<MenuItemProps, 'value'> = {}) => (
    <Menu.Item key={value} value={value} {...props}><Box flex="1">{name ?? capitalize(value)}</Box><Icon /></Menu.Item>
)

export type MenuItemRender = (extra: MenuItemProps) => React.JSX.Element;

export const primaryActionProps: IconButtonProps = {
    margin: "1px",
    variant: "subtle",
    size: 'xs'
}