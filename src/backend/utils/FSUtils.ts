import { accessSync, constants } from "fs";
import { promises } from "node:fs";
import pathUtil from "path";


export async function readText(path: any) {
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
}export async function writeFile(path: any, text: any) {
    // await promises.access(path, constants.W_OK | constants.O_CREAT);
    try {
        await promises.writeFile(path, text, 'utf8');
    } catch (e) {
        throw e;
    }

    // return new Promise((resolve, reject) => {
    //     fs.readFile(path, 'utf8', function (err, data) {
    //         if (err) {
    //             reject(err);
    //         }
    //         resolve(JSON.parse(data));
    //     });
    // });
}

export const fileOrDirectoryIsWriteable = (location: string) => {
    const pathInfo = pathUtil.parse(location);
    const isDir = pathInfo.ext === '';
    try {
        accessSync(location, constants.R_OK | constants.W_OK);
        return true;
    } catch (err: any) {
        const { code } = err;
        if (code === 'ENOENT') {
            // file doesn't exist, see if we can write to directory in which case we are good
            try {
                accessSync(pathInfo.dir, constants.R_OK | constants.W_OK);
                // we can write to dir
                return true;
            } catch (accessError: any) {
                if (accessError.code === 'EACCES') {
                    // also can't access directory :(
                    throw new Error(`No ${isDir ? 'directory' : 'file'} exists at ${location} and application does not have permission to write to the parent directory`);
                } else {
                    throw new Error(`No ${isDir ? 'directory' : 'file'} exists at ${location} and application is unable to access the parent directory due to a system error`, { cause: accessError });
                }
            }
        } else if (code === 'EACCES') {
            throw new Error(`${isDir ? 'Directory' : 'File'} exists at ${location} but application does not have permission to write to it.`);
        } else {
            throw new Error(`${isDir ? 'Directory' : 'File'} exists at ${location} but application is unable to access it due to a system error`, { cause: err });
        }
    }
};

export const fileExists = (location: string) => {
    const pathInfo = pathUtil.parse(location);
    const isDir = pathInfo.ext === '';
    try {
        accessSync(location, constants.R_OK);
        return true;
    } catch (err: any) {
        const { code } = err;
        if (code === 'ENOENT') {
            return false;
        } else if (code === 'EACCES') {
            throw new Error(`${isDir ? 'Directory' : 'File'} exists at ${location} but application does not have permission to write to it.`);
        } else {
            throw new Error(`${isDir ? 'Directory' : 'File'} exists at ${location} but application is unable to access it due to a system error`, { cause: err });
        }
    }
};