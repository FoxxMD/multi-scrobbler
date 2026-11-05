import { type ComponentProps, useMemo } from "react";
import { Stat } from "@chakra-ui/react";
import { type AbbreviatedOpts, convertNumToAbbreviated } from "../../core/DataUtils.js";

export interface NumberFormatOpts {
    /** Fixed number of decimal places for numbers that are not abbreviated. Default 0 */
    decimals?: number
    /** Locale used by Intl.NumberFormat for separators. Default browser locale */
    locale?: Intl.LocalesArgument
    /** Abbreviate large numbers (12.3K, 1.05M...). `true` uses default AbbreviatedOpts */
    abbreviate?: boolean | AbbreviatedOpts
}

/**
 * Returns a number => string formatter.
 *
 * Without `abbreviate` numbers are formatted with `decimals` and `locale`.
 * With `abbreviate` numbers with at least `minDigits` digits are abbreviated (see convertNumToAbbreviated)
 * and shown with at most `maxDecimals` decimal places (EX 12.3K), smaller numbers are formatted with `decimals`.
 * */
export const createNumberFormatter = (opts: NumberFormatOpts = {}): (n: number) => string => {
    const { decimals = 0, locale, abbreviate = false } = opts;
    const plain = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format;
    if (abbreviate === false) {
        return plain;
    }
    const abbrOpts = abbreviate === true ? {} : abbreviate;
    // num is already rounded by convertNumToAbbreviated, this only localizes the decimal mark and drops trailing zeros
    const abbreviated = new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format;
    return (n: number) => {
        const { num, abbreviation } = convertNumToAbbreviated(n, abbrOpts);
        return abbreviation === undefined ? plain(num) : `${abbreviated(num)}${abbreviation}`;
    };
}

/** Memoized createNumberFormatter */
export const useNumberFormatter = (opts: NumberFormatOpts = {}) => {
    const { decimals, locale, abbreviate } = opts;
    // depend on primitives so an inline `abbreviate` object doesn't rebuild the formatter every render
    const abbrTrue = abbreviate === true;
    const abbrObj = typeof abbreviate === 'object' ? abbreviate : undefined;
    const hasAbbrObj = abbrObj !== undefined;
    const minDigits = abbrObj?.minDigits;
    const maxDecimals = abbrObj?.maxDecimals;
    return useMemo(() => createNumberFormatter({
        decimals,
        locale,
        abbreviate: hasAbbrObj ? { minDigits, maxDecimals } : abbrTrue
    }), [decimals, locale, abbrTrue, hasAbbrObj, minDigits, maxDecimals]);
}

/**
 * Drop-in replacement for Stat.ValueText that formats (and optionally abbreviates) a number. No animation, see CountUpValueText for that.
 * */
export const NumberValueText = (props: NumberFormatOpts & {
    value: number
} & Omit<ComponentProps<typeof Stat.ValueText>, 'children'>) => {
    const { value, decimals, locale, abbreviate, ...rest } = props;
    const format = useNumberFormatter({ decimals, locale, abbreviate });
    return <Stat.ValueText {...rest}>{format(value)}</Stat.ValueText>;
}
