import { create as diffCreate } from "jsondiffpatch";
import { numberFormatOptions } from './Atomic.js';
import { diffDelta, applyDelta, IJsonDelta, DeltaOptions } from 'json-diff-ts';
// may want to return to this one day
// but currently the jsondiffpatch formatter is the best console/ansi diff output for humans :(
//import {DiffOptions, DiffOptionsColor, diff as jestDiff} from 'jest-diff';
import chalk from 'chalk';
import clone from "clone";
import ConsoleFormatter from "jsondiffpatch/formatters/console";
import assert from "node:assert";

const console = new ConsoleFormatter();

export const jdiff = diffCreate({
    propertyFilter(name, context) {
        return name !== 'lifecycle';
    },
    cloneDiffValues: true
    //omitRemovedValues: true
});

const diffOptions: DeltaOptions = {
    /*arrayIdentityKeys: {artists: '$value'},*/ 
    reversible: false, 
    keysToSkip: ['playDate','playDateCompleted','listenRanges']
};

export const diffObjects = (a: object, b: object) => {
    return diffDelta(a, b, diffOptions);
}

export const patchObject = <T>(a: T, b: IJsonDelta): T => {
    return applyDelta(clone(a), b);
}

// const jestDiffOptions: DiffOptions = {
//     aAnnotation: 'Old', 
//     bAnnotation: 'New', 
//     aColor: chalk.red,
//     bColor: chalk.green
// }

export const diffObjectsConsoleOutput = (a: object, b: object, showUnchanged: boolean = false) => {
    //return jestDiff(a, b, jestDiffOptions);

    const left = JSON.parse(JSON.stringify(a));
    return console.format(jdiff.diff(left, JSON.parse(JSON.stringify(b))), showUnchanged ? left : undefined);
}

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

export const generateArray = <T = any>(size: number, gen: (index: number) => T): T[] => {
    return Array.from(Array(size), (v,k) => gen(k));
}

/** Return an array in chunks
 * 
 * https://stackoverflow.com/a/8495740/1469797
 */
export const chunkArray = <T>(chunkSize: number, arr: T[]): T[][] => {
    assert(chunkSize !== 0, 'chunkSize cannot be 0');
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice(i, i + chunkSize);
        chunks.push(chunk);
    }
    return chunks;
}