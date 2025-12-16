import JSON5 from "json5";
import { constants, promises } from "fs";
import { MaybeLogger } from "../common/logging.js";

export const asArray = <T>(data: T | T[]): T[] => {
    if (Array.isArray(data)) {
        return data;
    }
    return [data];
}

const handler: ProxyHandler<object> =
{
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

/** Return a Proxy of an object where keys can be accessed case-insensitive
 * 
 * https://stackoverflow.com/a/50102779/1469797
 */
export const noCasePropObj = <T>(obj: T): T => {
    let newObj;

    if (typeof obj == "object") {
        newObj = new Proxy({}, handler);
        // traverse the Original object converting string keys to upper case
        for (var key in obj) {
            if (typeof key == "string") {
                var objKey = key.toUpperCase();
                if (!(key in newObj))
                    newObj[objKey] = checkAtomic(obj[key]);
            }
        }
    }
    else if (Array.isArray(obj)) {
        // in an array of objects convert to upper case string keys within each row
        newObj = new Array();
        for (var i = 0; i < obj.length; i++)
            newObj[i] = checkAtomic(obj[i]);
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
        logger.debug(`Matched: ${matched.size === 0 ? 'None' : Array.from(matched.values()).join(', ')} | Unmatched: ${unmatched.size === 0 ? 'None' : Array.from(unmatched.values()).join(', ')}`);
    }
    return replaced;
};
export const INTERPOLATION_WRAPPED_REGEX: RegExp = new RegExp(/\[\[([^\r\n\[\]]+?)\]\]/g);

