import React, { Fragment, useState, useEffect, FC } from "react"
import { useDebounce } from "use-debounce";
import { useTypedCodeblocksStorage } from "../useCodeblocksStorage";
import CodeInline from '@theme/CodeInline';
import BrowserOnly from '@docusaurus/BrowserOnly';

export interface LocalStorateTextProps {
    readOnly?: boolean
    storageKey: string
    initialValue?: string
    placeholder?: string
    stylePreset?: 'inline' | 'bold' | 'placeholder'
    sensitive?: boolean
}

// dashed box like starlight-codeblocks fill-in placeholders, so readers can tell it is the same value
const placeholderStyle: React.CSSProperties = {
    border: '1px dashed color-mix(in srgb, currentColor 60%, transparent)',
    borderRadius: '3px',
    padding: '1px 3px',
    background: 'color-mix(in srgb, currentColor 10%, transparent)',
    fontFamily: 'var(--ifm-font-family-monospace)',
};

export type FixedStorageProps = Omit<LocalStorateTextProps, 'storageKey'>;

const InternalLocalStorageText: FC<LocalStorateTextProps> = (props) => {

    const {
        readOnly = false,
        stylePreset,
        placeholder,
        storageKey,
        initialValue = "",
        sensitive = false
    } = props

        const [storageVal, setStorageVal] = useTypedCodeblocksStorage(storageKey, initialValue);
        const [inputValue, setInputValue] = React.useState(storageVal);
        const [value, setValue] = useDebounce(inputValue, 500);
        useEffect(() => {
            setStorageVal(value);
        }, [value, setStorageVal]);
    
        const handleInputChange = (event) => {
            setInputValue(event.target.value);
        }

        useEffect(() => {
            setValue(storageVal);
            setInputValue(storageVal);
        }, [storageVal, setValue, setInputValue])

        const sensitiveClass = sensitive ? 'rr-mask' : '';

        if(readOnly) {
            let roVal: string = '';
            if(storageVal !== undefined && storageVal !== null && storageVal.trim() !== '') {
                roVal = storageVal;
            } else if(initialValue !== '') {
                roVal = initialValue;
            } else if(placeholder !== undefined) {
                roVal = placeholder;
            }

            switch(stylePreset) {
                case 'inline':
                    return <CodeInline className={sensitiveClass}>{roVal}</CodeInline>;
                case 'bold':
                    return <strong className={sensitiveClass}>{roVal}</strong>;
                case 'placeholder':
                    return <span className={sensitiveClass} style={placeholderStyle}>{roVal}</span>;
                default:
                    return <span className={sensitiveClass}>{roVal}</span>;
            }
        }

        // same sizing as starlight-codeblocks placeholders: as wide as the value (or placeholder text), in monospace ch
        const inputPlaceholderStyle: React.CSSProperties = {
            ...placeholderStyle,
            boxSizing: 'content-box',
            width: `${Math.max(1, (placeholder ?? '').length, inputValue.length)}ch`,
        };

        return <input type="text" className={sensitiveClass} placeholder={placeholder} onChange={handleInputChange} value={inputValue} style={stylePreset === 'placeholder' ? inputPlaceholderStyle : undefined}/>
}

export const LocalStorageText:  FC<LocalStorateTextProps> = (props) => {
    return <BrowserOnly>{() => <InternalLocalStorageText {...props}/>}</BrowserOnly>
}