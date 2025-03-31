import { Files, File } from "formidable";
import VolatileFile from "formidable/VolatileFile.js";
import {CurlGenerator} from "curl-generator";
import { CurlBody } from "curl-generator/dist/bodies/body.js";
import { Logger, LogLevel } from "@foxxmd/logging";
import { Intercept } from "./InterceptUtils.js";

// typings from Formidable are all nuts.
// VolatileFile is missing buffer and also does not extend File even though it should

export const getValidMultipartJsonFile = (files: Files | File): [VolatileFile, string[]?] => {

    const logs: string[] = [];

    try {

        if (isVolatileFile(files)) {
            if ('mimetype' in files && files.mimetype !== undefined) {
                if (files.mimetype.includes('json')) {
                    logs.push(`Found ${getFileIdentifier(files)} with mimetype '${files.mimetype}'`)
                    return [files as unknown as VolatileFile, logs];
                } else {
                    logs.push(`${getFileIdentifier(files)} mimetype '${files.mimetype}' does not include 'json'`);
                }
            } else {
                logs.push(`${getFileIdentifier(files)} had no mimetype`)
            }
        } else {
            for (const [partName, namedFile] of Object.entries(files)) {
                if (Array.isArray(namedFile)) {
                    for (const [index, file] of Object.entries(namedFile)) {
                        if ('mimetype' in file && file.mimetype !== undefined) {
                            if (file.mimetype.includes('json')) {
                                logs.push(`Found ${partName}.${index}.${getFileIdentifier(file)} with mimetype '${file.mimetype}'`)
                                return [file as unknown as VolatileFile, logs];
                            } else {
                                logs.push(`${partName}.${index}.${getFileIdentifier(file)} mimetype '${file.mimetype}' does not include 'json'`);
                            }
                        } else {
                            logs.push(`${partName}.${index}.${getFileIdentifier(file)} had no mimetype`)
                        }
                    }
                } else {
                    // this shouldn't happen but it was happening so...
                    const singleFile = namedFile as File;
                    if (typeof singleFile === 'object' && 'mimetype' in singleFile && singleFile.mimetype !== undefined) {
                        if (singleFile.mimetype.includes('json')) {
                            logs.push(`Found ${partName}.${getFileIdentifier(singleFile)} with mimetype '${singleFile.mimetype}'`);
                            return [namedFile as unknown as VolatileFile, logs];
                        } else {
                            logs.push(`${partName}.${getFileIdentifier(singleFile)} mimetype '${singleFile.mimetype}' does not include 'json'`);
                        }
                    } else {
                        logs.push(`${partName}.${getFileIdentifier(singleFile)} had no mimetype`)
                    }
                }
            }
        }
    } catch (e) {
        throw new Error('Unexpected error occurred while trying to find valid json file in formdata', {cause: e});
    }

    return [undefined, logs];
}

const isVolatileFile = (val: unknown): val is File => {
    return typeof val === 'object'
        && val !== null
        && 'size' in val
        && 'filepath' in val;
}

export const getFileIdentifier = (f: File): string => {
    return f.originalFilename === null ? f.newFilename : f.originalFilename;
}

export const generateCurl = async (val: Request): Promise<string> => {
    try {
        const req = val.clone();
        req.headers.delete('host');
        const headers = Object.fromEntries(req.headers);
        let body: CurlBody | undefined;
        const b = await req.text();
        if (b.length !== 0) {
            body = {
                type: 'raw',
                content: b.toString()
            }
        }
        return CurlGenerator({
            url: req.url.toString(),
            method: req.method as "GET" | "get" | "POST" | "post" | "PUT" | "put" | "PATCH" | "patch" | "DELETE" | "delete",
            headers,
            body
        });
    } catch (e) {
        throw new Error('Could not generate CURL request', { cause: e });
    }
}

export const generateCurlSafe = async (val: Request, logger?: Logger): Promise<string | undefined> => {
    try {
        return await generateCurl(val);
    } catch (e) {
        if (logger !== undefined) {
            logger.warn(new Error('Could not generate CURL command', { cause: e }));
        }
    }
    return;
}

export interface LogCurlOptions {
    msg?: string, 
    prefix?: string,
    level?: LogLevel
}

export const logCurlSafe = async (val: Request, logger: Logger, opts: LogCurlOptions = {}): Promise<void> => {
    const curlCmd = await generateCurlSafe(val, logger);
    if (curlCmd !== undefined) {
        const { msg = 'CURL', level = 'debug', prefix = '' } = opts;
        logger[level](`${prefix !== '' ? `${prefix} ` : ''}${msg}
${curlCmd}`);
    }
}

export const logInterceptCurlSafe = async (intercept: Intercept | undefined, logger: Logger, opts: {logOnMiss?: boolean} & LogCurlOptions = {}): Promise<void> => {
    const {logOnMiss = false} = opts;
    if(intercept === undefined) {
        if(logOnMiss) {
            logger.debug(`No intercept found!`);
        }
        return;
    }

    if(intercept.req !== undefined) {
        await logCurlSafe(intercept.req, logger, {prefix: '(REQ)', ...opts});
    } else if(logOnMiss) {
        logger.debug(`No request to log for Intercept ${intercept.id}`);
    }
}