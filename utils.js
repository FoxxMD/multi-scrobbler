import fs, {promises, constants} from "fs";

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

export const buildTrackString = (obj) => {
    const {
        track: {
            artists = [],
            name,
            id,
            external_urls: {
                spotify,
            } = {}
        } = {},
        played_at
    } = obj;
    let artistString = artists.reduce((acc, curr) => acc.concat(curr.name), []).join(' / ');
    return `${artistString} - ${name}, played at ${played_at}`
}
