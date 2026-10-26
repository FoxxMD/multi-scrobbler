import React, { Fragment, useState, useEffect, useLayoutEffect, useRef, FC } from "react"
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
    fontFamily: 'var(--sl-font-mono, var(--sl-font-system-mono))',
    // form controls don't inherit font by default; keep the input and its measuring mirror on the same font
    fontSize: 'inherit',
    lineHeight: 'inherit',
    letterSpacing: 'inherit',
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
    
        const mirrorRef = useRef<HTMLSpanElement>(null);
        const [textWidth, setTextWidth] = useState<number | undefined>(undefined);
        useLayoutEffect(() => {
            if (mirrorRef.current) setTextWidth(mirrorRef.current.getBoundingClientRect().width);
        }, [inputValue, placeholder]);

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

        // as wide as the value (or placeholder text). `ch` alone is not reliable: the rendered glyphs can be wider than the
        // `0` that `ch` measures (font fallback, sub-pixel rounding, caret), so measure the real text with a hidden mirror.
        const mirrorText = inputValue || placeholder || ' ';
        const inputPlaceholderStyle: React.CSSProperties = {
            ...placeholderStyle,
            boxSizing: 'content-box',
            width: textWidth === undefined ? `${Math.max(1, mirrorText.length)}ch` : `${Math.ceil(textWidth) + 2}px`,
        };

        if (stylePreset !== 'placeholder') {
            return <input type="text" className={sensitiveClass} placeholder={placeholder} onChange={handleInputChange} value={inputValue}/>
        }
        return <>
            <span ref={mirrorRef} aria-hidden="true" style={{...placeholderStyle, position: 'absolute', visibility: 'hidden', whiteSpace: 'pre', padding: 0, border: 0}}>{mirrorText}</span>
            <input type="text" className={sensitiveClass} placeholder={placeholder} onChange={handleInputChange} value={inputValue} style={inputPlaceholderStyle}/>
        </>
}

export const LocalStorageText:  FC<LocalStorateTextProps> = (props) => {
    return <BrowserOnly>{() => <InternalLocalStorageText {...props}/>}</BrowserOnly>
}