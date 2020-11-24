import fs, {promises, constants} from "fs";
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

export async function readJson(path) {
    await promises.access(path, constants.R_OK);
    const data = await promises.readFile(path);
    return JSON.parse(data);

    // return new Promise((resolve, reject) => {
    //     fs.readFile(path, 'utf8', function (err, data) {
    //         if (err) {
    //             reject(err);
    //         }
    //         resolve(JSON.parse(data));
    //     });
    // });
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

export const buildTrackString = (playObj) => {
    const {
        data: {
            artist,
            album,
            track,
            playDate
        } = {}
    } = playObj;

    return `${artist} - ${track}, played at ${playDate.local().format()}`
}

// sorts playObj formatted objects by playDate in ascending (oldest first) order
export const sortByPlayDate = (a, b) => a.data.playDate.isAfter(b.data.playDate) ? 1 : -1;


/*
* Code below this comes from https://github.com/samthor/promises
* I'm not using the package because the package type isn't module or something
* */

const noop = () => {};

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

    return async function(...args) {
        previousResolve(abortSymbol);
        ({promise: previousPromise, resolve: previousResolve} = resolvable());
        const localSinglePromise = previousPromise;

        const iter = generator(...args);
        let resumeValue;
        for (;;) {
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
            } catch(e) {
                resumeValue = e;
            }
            // next loop, we give resumeValue back to the generator
        }
    };
}
