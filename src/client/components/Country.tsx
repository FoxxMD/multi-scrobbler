import type React from "react";
import TsCountryFlag from "ts-react-emoji-flag";

export const browserLocale: string =
    (navigator.languages && navigator.languages.length
        ? navigator.languages[0]
        : navigator.language) ?? 'en-US';

const getCountryNamesIntl = new Intl.DisplayNames([browserLocale], { type: 'region' });

export const getCountryName = (iso2: string) => {
    const name = getCountryNamesIntl.of(iso2);
    if (name !== undefined) {
        return name;
    }
    return iso2;
}

export const CountryFlag = (props: {
    iso: string,
    tooltip?: true | string | ((country: string) => string)
}) => {
    const isoToUse = props.iso === 'XW' ? 'UN' : props.iso;

    let content: string | undefined = undefined;;
    if (props.tooltip !== undefined) {
        if (props.tooltip === true) {
            content = getCountryName(props.iso);
        } else if (typeof props.tooltip === 'function') {
            content = props.tooltip(getCountryName(props.iso))
        } else {
            content = props.tooltip;
        }
    }
    return <TsCountryFlag countryCode={isoToUse} title={content}/>;
}