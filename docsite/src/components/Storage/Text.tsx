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
    stylePreset?: 'inline' | 'bold'
    sensitive?: boolean
}

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
                default:
                    return <span className={sensitiveClass}>{roVal}</span>;
            }
        }

        return <input type="text" className={sensitiveClass} placeholder={placeholder} onChange={handleInputChange} value={inputValue}/>
}

export const LocalStorageText:  FC<LocalStorateTextProps> = (props) => {
    return <BrowserOnly>{() => <InternalLocalStorageText {...props}/>}</BrowserOnly>
}