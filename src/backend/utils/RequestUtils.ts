import { Files, File } from "formidable";
import VolatileFile from "formidable/VolatileFile.js";

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
