import React, { Fragment, useState, useEffect, useLayoutEffect, useRef, FC } from "react"
import { useDebounce } from "use-debounce";
import { useTypedCodeblocksStorage } from "../useCodeblocksStorage";

export interface LocalStorateTextProps {
    readOnly?: boolean
    storageKey: string
    initialValue?: string
    placeholder?: string
    stylePreset?: 'inline' | 'bold' | 'placeholder'
    sensitive?: boolean
    /** rendered before the value, not stored */
    prefix?: string
    /** rendered after the value, not stored */
    suffix?: string
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

// editable input that blends into a surrounding <code> element; dashed underline marks it as editable
const inlineInputStyle: React.CSSProperties = {
    border: 0,
    borderBottom: '1px dashed color-mix(in srgb, currentColor 60%, transparent)',
    padding: 0,
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    letterSpacing: 'inherit',
};

const copyButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    verticalAlign: 'middle',
    marginInlineStart: '0.25em',
    padding: '2px',
    border: 0,
    borderRadius: '3px',
    background: 'transparent',
    color: 'inherit',
    opacity: 0.7,
    cursor: 'pointer',
};

// inputs are not part of the document text selection, so prefix + value + suffix can't be selected together; copy it instead
const CopyButton: FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied) return;
        const t = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(t);
    }, [copied]);
    const copy = () => navigator.clipboard.writeText(text).then(() => setCopied(true), console.error);
    const label = copied ? 'Copied' : `Copy ${text}`;
    return <button type="button" onClick={copy} title={label} aria-label={label} style={copyButtonStyle}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {copied
                ? <path d="M20 6 9 17l-5-5"/>
                : <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>}
        </svg>
    </button>;
};

export type FixedStorageProps = Omit<LocalStorateTextProps, 'storageKey'>;

const InternalLocalStorageText: FC<LocalStorateTextProps> = (props) => {

    const {
        readOnly = false,
        stylePreset,
        placeholder,
        storageKey,
        initialValue = "",
        sensitive = false,
        prefix = '',
        suffix = ''
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

        const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
            setInputValue(event.target.value);
        }

        useEffect(() => {
            setValue(storageVal);
            setInputValue(storageVal);
        }, [storageVal, setValue, setInputValue])

        const sensitiveClass = sensitive ? 'rr-mask' : '';
        const withCopy = (val: string) => prefix !== '' || suffix !== '' ? <CopyButton text={`${prefix}${val}${suffix}`}/> : null;

        if(readOnly) {
            let roVal: string = '';
            if(storageVal !== undefined && storageVal !== null && storageVal.trim() !== '') {
                roVal = storageVal;
            } else if(initialValue !== '') {
                roVal = initialValue;
            } else if(placeholder !== undefined) {
                roVal = placeholder;
            }

            let styled: React.ReactNode;
            switch(stylePreset) {
                case 'inline':
                    styled = <code className={sensitiveClass}>{roVal}</code>;
                    break;
                case 'bold':
                    styled = <strong className={sensitiveClass}>{roVal}</strong>;
                    break;
                case 'placeholder':
                    styled = <span className={sensitiveClass} style={placeholderStyle}>{roVal}</span>;
                    break;
                default:
                    styled = <span className={sensitiveClass}>{roVal}</span>;
            }
            return <>{prefix}{styled}{suffix}{withCopy(roVal)}</>;
        }

        // as wide as the value (or placeholder text). `ch` alone is not reliable: the rendered glyphs can be wider than the
        // `0` that `ch` measures (font fallback, sub-pixel rounding, caret), so measure the real text with a hidden mirror.
        const mirrorText = inputValue || placeholder || ' ';
        const width = textWidth === undefined ? `${Math.max(1, mirrorText.length)}ch` : `${Math.ceil(textWidth) + 2}px`;

        if (stylePreset !== 'placeholder' && stylePreset !== 'inline') {
            return <>{prefix}<input type="text" className={sensitiveClass} placeholder={placeholder} onChange={handleInputChange} value={inputValue}/>{suffix}{withCopy(inputValue || placeholder || '')}</>
        }
        const baseStyle = stylePreset === 'inline' ? inlineInputStyle : placeholderStyle;
        const field = <>
            <span ref={mirrorRef} aria-hidden="true" style={{...baseStyle, position: 'absolute', visibility: 'hidden', whiteSpace: 'pre', padding: 0, border: 0}}>{mirrorText}</span>
            <input type="text" className={sensitiveClass} placeholder={placeholder} onChange={handleInputChange} value={inputValue} style={{...baseStyle, boxSizing: 'content-box', width}}/>
        </>;
        return <>{prefix}{stylePreset === 'inline' ? <code>{field}</code> : field}{suffix}{withCopy(inputValue || placeholder || '')}</>
}

export const LocalStorageText:  FC<LocalStorateTextProps> = (props) => {
    // stored values only exist in the browser, so render nothing during SSR and the first hydration pass
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    return mounted ? <InternalLocalStorageText {...props}/> : null;
}