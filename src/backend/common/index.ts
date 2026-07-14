import * as path from 'path';
import envPaths from 'env-paths';

const osPaths = envPaths('multi-scrobbler', {suffix: ''});

export const getConfigDir = (): string => {
    let configDirVal: string = process.env.CONFIG_DIR ?? osPaths.config;
    // this shouldn't happen...
    // but if it does we need to have some known path fallback so things don't explode
    if(configDirVal === undefined) {
        configDirVal = getPathFromCWD('./config'); // backwards compatibility
    }
    // resolve from relative directory, if one was used
    return path.resolve(configDirVal);
}

export const getDataDir = (): string => {
    let dataDirVal: string = process.env.DATA_DIR ?? osPaths.data;
    // this shouldn't happen...
    // but if it does we need to have some known path fallback so things don't explode
    if(dataDirVal === undefined) {
        dataDirVal = getPathFromCWD('./config'); // defaulting to same directory for backwards compatibility
    }
    // resolve from relative directory, if one was used
    return path.resolve(dataDirVal);
}

export const getPathFromCWD = (...relativePaths: string[]) => path.resolve(process.cwd(), ...relativePaths);