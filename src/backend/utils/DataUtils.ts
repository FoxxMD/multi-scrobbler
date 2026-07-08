import JSON5 from "json5";
import { constants, promises } from "fs";
import { MaybeLogger } from '../common/MaybeLogger.js';
import { deepEqual } from 'fast-equals';
import { type CommonConfigPrimitives } from "../common/infrastructure/config/common.js";
import { parseBoolStrict, removeUndefinedKeys } from "../utils.js";
import { nonEmptyStringOrDefault } from "../../core/StringUtils.js";

export const asArray = <T>(data: T | T[]): T[] => {
    if (Array.isArray(data)) {
        return data;
    }
    return [data];
}

const handler: ProxyHandler<object> =
{
    ownKeys(target) {
      return Reflect.ownKeys(target).map(x => typeof x === 'string' ? x.toLocaleLowerCase() : x);
    },
    getOwnPropertyDescriptor(target, key) {
      return {
        ...Reflect.getOwnPropertyDescriptor(target, key),
        enumerable: true,
        configurable: true,
      };
    },
    get: function (target, key) {
        //console.log("key: " + key.toString());
        if (typeof key == "string") {
            const uKey = key.toUpperCase();

            if ((key != uKey) && (key in target))
                return target[key];
            return target[uKey];
        }
        return target[key];
    },
    set: function (target, key, value) {
        if (typeof key == "string") {
            const uKey = key.toUpperCase();

            if ((key != uKey) && (key in target))
                target[key] = value;
            target[uKey] = value;
            return true;
        }
        else {
            target[key] = value;
            return true;
        }

    },
    deleteProperty: function (target, key) {
        if (typeof key == "string") {
            const uKey = key.toUpperCase();

            if ((key != uKey) && (key in target))
                delete target[key];
            if (uKey in target)
                delete target[uKey];
            return true;
        }
        else {
            delete target[key];
            return true;
        }

    },
};

const checkAtomic = (value) => {
    if (typeof value == "object")
        return noCasePropObj(value); // recursive call only for Objects
    return value;
}

export type toLowerCase<T> = {
    [K in keyof T]: T[K]
}

export type LowercaseString<S extends string> = S extends `${infer Str}` 
    ? `${Lowercase<Str>}` 
    : S;

/** https://medium.com/@vincent.dibon_78881/type-level-uppercase-and-lowercase-in-typescript-c18f574f4572 */
export type LowercaseKeys<T> = {
    [K in keyof T as LowercaseString<Extract<K, string>>]: T[K]
};

/** Return a Proxy of an object where keys can be accessed case-insensitive
 * 
 * Note: objects from rest operator in spread are *always* lowercase
 * 
 * @see https://stackoverflow.com/a/50102779/1469797
 */
export const noCasePropObj = <T extends object>(obj: T): LowercaseKeys<T> => {

    const newObj = new Proxy<LowercaseKeys<T>>({} as LowercaseKeys<T>, handler);
    // traverse the Original object converting string keys to upper case
    for (var key in obj) {
        if (typeof key == "string") {
            var objKey = key.toUpperCase();
            if (!(key in newObj))
                newObj[objKey] = checkAtomic(obj[key]);
        }
    }
    return newObj; // object with upper cased keys
}
export async function readJson(this: any, path: any, options: ReadJsonOptions = {}) {
    const {
        throwOnNotFound = true, 
        interpolateEnvs = true,
        logger
    } = options;

    try {
        await promises.access(path, constants.R_OK);
        const data = (await promises.readFile(path)).toString();
        if(interpolateEnvs) {
            const replaced = replaceInterpolatedValues(data, process.env, logger);
            return JSON5.parse(replaced);
        }
        return JSON5.parse(data);
    } catch (e) {
        const { code } = e;
        if (code === 'ENOENT') {
            if (throwOnNotFound) {
                throw new Error(`No file found at given path: ${path}`, { cause: e });
            } else {
                return;
            }
        }
        throw new Error(`Encountered error while parsing file: ${path}`, { cause: e });
    }
}export interface ReadJsonOptions {
    throwOnNotFound?: boolean;
    interpolateEnvs?: boolean;
    logger?: MaybeLogger
}
export const replaceInterpolatedValues = (str: string, fromVals: Record<string, any>, logger: MaybeLogger = new MaybeLogger()): string => {
    const cleanFromValKeys = noCasePropObj(fromVals);

    const matched = new Set(), unmatched = new Set();
    const replaced = str.replaceAll(INTERPOLATION_WRAPPED_REGEX, (match, p1) => {
        //const fv = cleanFromValKeys[p1.toLocaleLowerCase().trim()];
        const fv = cleanFromValKeys[p1.trim()];
        if (fv !== undefined) {
            matched.add(p1);
            return fv;
        }
        unmatched.add(p1);
        return match;
    });
    if (matched.size !== 0 || unmatched.size !== 0) {
        const logMsg = `Matched: ${matched.size === 0 ? 'None' : Array.from(matched.values()).join(', ')} | Unmatched: ${unmatched.size === 0 ? 'None' : Array.from(unmatched.values()).join(', ')}`;
        if(unmatched.size > 0) {
            logger.warn(logMsg);
        } else {
            logger.debug(logMsg);
        }

    }
    return replaced;
};
export const INTERPOLATION_WRAPPED_REGEX: RegExp = new RegExp(/\[\[([^\r\n\[\]]+?)\]\]/g);

export const objectIsEmpty = (obj: object, valueIsEmpty?: undefined | ((val: any) => boolean)): boolean => {
    if(Object.keys(obj).length === 0) {
        return true;
    }

    if(valueIsEmpty === undefined) {
        return false;
    }

    return Object.values(obj).every(x => valueIsEmpty(x));
}

/** Shuffle array in-place
 * 
 * https://stackoverflow.com/a/12646864/1469797
 */
export const shuffleArray = (array: any[]): void => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

export const objectsEqual = (a: object, b: object) => {
    try {
        return deepEqual(a, b);
    } catch (e) {
        throw new Error('Could not compare objects', {cause: e});
    }
}

export const getCommonComponentEnvConfig = (prefix: string): Partial<CommonConfigPrimitives> => {
    const e = nonEmptyStringOrDefault(process.env[`${prefix}_ENABLE`], undefined);
    return removeUndefinedKeys<CommonConfigPrimitives>({
        id: nonEmptyStringOrDefault(process.env[`${prefix}_ID`], undefined),
        name: nonEmptyStringOrDefault(process.env[`${prefix}_NAME`], undefined),
        enable: e !== undefined ? parseBoolStrict(e) : undefined
    }, false);
}

const byteSizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']

/**
 * Convert bytes into human readable size
 * 
 * @see https://stackoverflow.com/a/18650828/1469797
 */
export const formatBytes = (bytes: number, decimals: number = 2): [string, number, string] => {
    if (!+bytes) return ['0 Bytes', 0, 'Byes'];

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals

    const i = Math.floor(Math.log(bytes) / Math.log(k))

    const friendlySize = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
    const friendlyUnit = byteSizes[i];
    return [`${friendlySize} ${friendlyUnit}`, friendlySize, friendlyUnit];
}