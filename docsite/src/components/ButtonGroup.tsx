import React, { ReactNode, CSSProperties } from 'react';
import clsx from 'clsx'; 
import Link from '@docusaurus/Link';
import Button, { ButtonProps } from './Button';

const leftButton = {
    borderRadius: 'var(--ifm-button-border-radius) 0 0 var(--ifm-button-border-radius)'
}

const rightButton = {
    borderRadius: '0 var(--ifm-button-border-radius) var(--ifm-button-border-radius) 0'
}

const middleButton = {
    borderRadius: '0'
}

// Define the Button type to control the props that can be passed to the Button component.
type ButtonGroup = {
    options: [string, string][]
    value?: string
    defaultValue?: string
    // The size prop can be one of the following values: 'sm', 'lg', 'small', 'medium', 'large', or null.
    // We'll convert 'small' to 'sm' and 'large' to 'lg' in the component. 'medium' will be considered null.
    size?: 'sm' | 'lg' | 'small' | 'medium' | 'large' | null;

    variant: 'primary' | 'secondary' | 'danger' | 'warning' | 'success' | 'info' | 'link' | string;
    // The block prop is a boolean that determines if the button should be a block-level button.
    block?: boolean;
    // The disabled prop is a boolean that determines if the button should be disabled.
    disabled?: boolean;
    // The className prop is a string that allows you to add custom classes to the button.
    className?: string;
    // The style prop is an object that allows you to add custom styles to the button.
    style?: CSSProperties;
    onChange?: (val: string) => any
}

// Button component that accepts the specified props.
export default function ButtonGroup ({
    size = null, 
    variant = 'primary', 
    block = false, 
    disabled = false, 
    className, 
    style,
    options,
    value,
    defaultValue,
    onChange = () => null
}: ButtonGroup) {

    if(options === undefined || options.length === 0) {
        return null;
    }

    const buttons = options.map((opt, index) => {
        const props: ButtonProps = {
            style: middleButton,
            outline: true,
            size,
            variant,
            label: opt[1],
            link: '#',
            onClick: () => onChange(opt[0])
        };
        if(index === 0) {
            props.style = leftButton;
        } else if(index === options.length - 1) {
            props.style = rightButton;
        }

        if((value ?? defaultValue) === opt[0]) {
            props.outline = false;
        }

        return <Button key={index} {...props}/>

    });

    return <span>{buttons}</span>;
}