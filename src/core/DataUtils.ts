import { create as diffCreate } from "jsondiffpatch";
import { numberFormatOptions } from './Atomic.js';


export const jdiff = diffCreate({
    propertyFilter(name, context) {
        return name !== 'lifecycle';
    },
    cloneDiffValues: true
    //omitRemovedValues: true
});

export const formatNumber = (val: number | string, options?: numberFormatOptions) => {
    const {
        toFixed = 2, defaultVal = null, prefix = '', suffix = '', round,
    } = options || {};
    let parsedVal = typeof val === 'number' ? val : Number.parseFloat(val);
    if (Number.isNaN(parsedVal)) {
        return defaultVal;
    }
    if (!Number.isFinite(val)) {
        return 'Infinite';
    }
    let prefixStr = prefix;
    const { enable = false, indicate = true, type = 'round' } = round || {};
    if (enable && !Number.isInteger(parsedVal)) {
        switch (type) {
            case 'round':
                parsedVal = Math.round(parsedVal);
                break;
            case 'ceil':
                parsedVal = Math.ceil(parsedVal);
                break;
            case 'floor':
                parsedVal = Math.floor(parsedVal);
        }
        if (indicate) {
            prefixStr = `~${prefix}`;
        }
    }
    const localeString = parsedVal.toLocaleString(undefined, {
        minimumFractionDigits: toFixed,
        maximumFractionDigits: toFixed,
    });
    return `${prefixStr}${localeString}${suffix}`;
};

export const generateArray = (size: number, gen: (index: number) => any) => {
    return Array.from(Array(size), (v,k) => gen(k));
}

