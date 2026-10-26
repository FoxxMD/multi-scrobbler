import React, { ReactNode, CSSProperties } from 'react';
import clsx from 'clsx'; 
import Link from '@docusaurus/Link';

// Define the Button type to control the props that can be passed to the Button component.
export type ButtonProps = {
    // The size prop can be one of the following values: 'sm', 'lg', 'small', 'medium', 'large', or null.
    // We'll convert 'small' to 'sm' and 'large' to 'lg' in the component. 'medium' will be considered null.
    size?: 'sm' | 'lg' | 'small' | 'medium' | 'large' | null;
    // The outline prop is a boolean that determines if the button should be an outline button.
    outline?: boolean;
    // The variant prop is a string that determines the color of the button.
    // It can be one of the following values: 'primary', 'secondary', 'danger', 'warning', 'success', 'info', 'link', or any other string.
    // The default value is 'primary'.
    variant: 'primary' | 'secondary' | 'danger' | 'warning' | 'success' | 'info' | 'link' | string;
    // The block prop is a boolean that determines if the button should be a block-level button.
    block?: boolean;
    // The disabled prop is a boolean that determines if the button should be disabled.
    disabled?: boolean;
    // The className prop is a string that allows you to add custom classes to the button.
    className?: string;
    // The style prop is an object that allows you to add custom styles to the button.
    style?: CSSProperties;
    // The link prop is a string that determines the URL the button should link to.
    link: string;
    // The label prop is a string that determines the text of the button.
    label: string;
    onClick?: () => any
}

// Button component that accepts the specified props.
export default function Button ({ 
    size = null, 
    outline = false, 
    variant = 'primary', 
    block = false, 
    disabled = false, 
    className, 
    style = {}, 
    link, 
    label,
    onClick = () => null,
    ...rest
}: ButtonProps) {
    // Map the size prop values to corresponding CSS classes.
    const sizeMap = {
        sm: 'sm',
        small: 'sm',
        lg: 'lg',
        large: 'lg',
        medium: null,
    };
    const buttonSize = size ? sizeMap[size] : '';
    const sizeClass = buttonSize ? `button--${buttonSize}` : '';
    const outlineClass = outline ? 'button--outline' : '';
    const variantClass = variant ? `button--${variant}` : '';
    const blockClass = block ? 'button--block' : '';
    const disabledClass = disabled ? 'disabled' : '';
    // If the button is disabled, set the destination to null.
    const destination = disabled ? null : link;
    return (
        <Link to={destination}>
            <button
                className={clsx(
                    'button',
                    sizeClass,
                    outlineClass,
                    variantClass,
                    blockClass,
                    disabledClass,
                    className
                )}
                style={style}
                role='button'
                aria-disabled={disabled}
                onClick={(e) => {
                    e.preventDefault();
                    onClick()
                }}
                {...rest}
            >
                {label}
            </button>
        </Link>
    );
}