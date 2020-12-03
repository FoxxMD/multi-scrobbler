import fs, {promises, constants} from "fs";
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import winston from "winston";
import jsonStringify from 'safe-stable-stringify';

const {format} = winston;
const {combine, printf, timestamp, label, splat, errors} = format;

dayjs.extend(utc);

export async function readJson(path, {logErrors = true, throwOnNotFound = true} = {}) {
    try {
        await promises.access(path, constants.R_OK);
        const data = await promises.readFile(path);
        return JSON.parse(data);
    } catch (e) {
        const {code} = e;
        if (code === 'ENOENT') {
            if (throwOnNotFound) {
                if (logErrors) {
                    this.logger.warn('No file found at given path', {filePath: path});
                }
                throw e;
            } else {
                return;
            }
        } else if (logErrors) {
            this.logger.warn(`Encountered error while parsing file`, {filePath: path});
            this.logger.error(e);
        }
        throw e;
    }
}

export async function readText(path) {
    await promises.access(path, constants.R_OK);
    const data = await promises.readFile(path);
    return data.toString();

    // return new Promise((resolve, reject) => {
    //     fs.readFile(path, 'utf8', function (err, data) {
    //         if (err) {
    //             reject(err);
    //         }
    //         resolve(JSON.parse(data));
    //     });
    // });
}

export async function writeFile(path, text) {
    // await promises.access(path, constants.W_OK | constants.O_CREAT);
    await promises.writeFile(path, text, 'utf8');

    // return new Promise((resolve, reject) => {
    //     fs.readFile(path, 'utf8', function (err, data) {
    //         if (err) {
    //             reject(err);
    //         }
    //         resolve(JSON.parse(data));
    //     });
    // });
}


export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const longestString = strings => strings.reduce((acc, curr) => curr.length > acc ? curr.length : acc, 0);
export const truncateStringArrToLength = (length, truncStr = '...') => {
    const truncater = truncateStringToLength(length, truncStr);
    return strings => strings.map(truncater);
}
export const truncateStringToLength = (length, truncStr = '...') => str => str.length > length ? `${str.slice(0, length)}${truncStr}` : str;

const defaultTransformer = input => input;

export const buildTrackString = (playObj, options = {}) => {
    const {
        include = ['time'],
        transformers: {
            artists: artistsFunc = a => a.join(' / '),
            track: trackFunc = defaultTransformer,
            time: timeFunc = t => t.local().format(),
            timeFromNow = t => t.local().fromNow(),
        } = {}
    } = options;
    const {
        data: {
            artists,
            album,
            track,
            playDate
        } = {}
    } = playObj;

    let str = `${artistsFunc(artists)} - ${trackFunc(track)}`;
    if (include.includes('time')) {
        str = `${str}, played at ${timeFunc(playDate)}`
    }
    if(include.includes('timeFromNow')) {
        str = `${str} (${timeFromNow(playDate)})`
    }
    return str;
}

// sorts playObj formatted objects by playDate in ascending (oldest first) order
export const sortByPlayDate = (a, b) => a.data.playDate.isAfter(b.data.playDate) ? 1 : -1;

const s = splat();
const SPLAT = Symbol.for('splat')
const errorsFormat = errors({stack: true});
const CWD = process.cwd();

let longestLabel = 3;
export const defaultFormat = printf(({level, message, label = 'App', timestamp, [SPLAT]: splatObj, stack, ...rest}) => {
    let stringifyValue = splatObj !== undefined ? jsonStringify(splatObj) : '';
    if (label.length > longestLabel) {
        longestLabel = label.length;
    }
    let msg = message;
    let stackMsg = '';
    if (stack !== undefined) {
        const stackArr = stack.split('\n');
        msg = stackArr[0];
        const cleanedStack = stackArr
            .slice(1) // don't need actual error message since we are showing it as msg
            .map(x => x.replace(CWD, 'CWD')) // replace file location up to cwd for user privacy
            .join('\n'); // rejoin with newline to preserve formatting
        stackMsg = `\n${cleanedStack}`;
    }

    return `${timestamp} ${level.padEnd(7)}: [${label.padEnd(longestLabel)}] ${msg}${stringifyValue !== '' ? ` ${stringifyValue}` : ''}${stackMsg}`;
});

export const labelledFormat = (labelName = 'App') => {
    const l = label({label: labelName, message: false});
    return combine(
        timestamp(
            {
                format: () => dayjs().local().format(),
            }
        ),
        l,
        s,
        errorsFormat,
        defaultFormat,
    );
}

export const createLabelledLogger = (name = 'default', label = 'App') => {
    if (winston.loggers.has(name)) {
        return winston.loggers.get(name);
    }
    const def = winston.loggers.get('default');
    winston.loggers.add(name, {
        transports: def.transports,
        level: def.level,
        format: labelledFormat(label)
    });
    return winston.loggers.get(name);
}

/*
* Code below this comes from https://github.com/samthor/promises
* I'm not using the package because the package type isn't module or something
* */

const noop = () => {
};

export function resolvable() {
    let resolve;
    const promise = new Promise((r) => resolve = r);
    return {promise, resolve};
}

async function toPromise(t) {
    return t;
}

export const takeoverSymbol = Object.seal({});

const abortSymbol = Object.seal({});  // distinct from takeoverSymbol so folks can't return it

export function makeSingle(generator) {
    let previousPromise;
    let previousResolve = noop;

    return async function (...args) {
        previousResolve(abortSymbol);
        ({promise: previousPromise, resolve: previousResolve} = resolvable());
        const localSinglePromise = previousPromise;

        const iter = generator(...args);
        let resumeValue;
        for (; ;) {
            const n = iter.next(resumeValue);
            if (n.done) {
                return n.value;  // final return value of passed generator
            }

            // whatever the generator yielded, _now_ run await on it
            try {
                resumeValue = await Promise.race([toPromise(n.value), localSinglePromise]);
                if (resumeValue === abortSymbol) {
                    return takeoverSymbol;
                }
            } catch (e) {
                resumeValue = e;
            }
            // next loop, we give resumeValue back to the generator
        }
    };
}
