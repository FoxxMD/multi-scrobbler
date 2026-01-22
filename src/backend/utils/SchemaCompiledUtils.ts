import { readFileSync, accessSync } from "node:fs";
import { constants, promises } from "fs";
import { resolve } from "path";
import { projectDir } from "../common/index.js";
import { MaybeLogger } from "../common/logging.js";

export const getSchemaForType = (type: string, logger: MaybeLogger = new MaybeLogger()): any => {
    const path = resolve(projectDir, `src/backend/common/schema/${type}.json`);
    try {
        accessSync(path, constants.R_OK);
    } catch (e) {
        const { code } = e;
        if (code === 'ENOENT') {
            throw new Error(`No file found at given path: ${path}`, { cause: e });
        }
        throw new Error(`Encountered error while parsing file: ${path}`, { cause: e });
    }
    return JSON.parse(readFileSync(path).toString());
}