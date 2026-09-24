import * as path from 'path';
import envPaths from 'env-paths';

const osPaths = envPaths('multi-scrobbler', {suffix: ''});

// see https://docs.multi-scrobbler.app/installation/#config-and-data-directories
// for systemd see: https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#:~:text=Table%C2%A02%2E%C2%A0Automatic%20directory%20creation%20and%20environment%20variables
// for os-specific like (linux) XDG, (mac) ~Library/..., (window) %APPDATA%\... or %LOCALAPPDATA%\...

export const getConfigDir = (): string => {
    let configDirVal: string = 
    process.env.CONFIG_DIR // user-defined OR used by Dockerfile
    ?? process.env.CONFIGURATION_DIRECTORY // set by systemd
    ?? osPaths.config; // os-specific path

    // this shouldn't happen...
    // but if it does we need to have some known path fallback so things don't explode
    if(configDirVal === undefined) {
        configDirVal = getPathFromCWD('./config'); // backwards compatibility
    }
    // resolve from relative directory, if one was used
    return path.resolve(configDirVal);
}

export const getDataDir = (): string => {
    let dataDirVal: string = 
    process.env.DATA_DIR ?? // user-defined OR used by Dockerfile
    process.env.STATE_DIRECTORY ?? // set by systemd
    osPaths.data; // os-specific path

    // this shouldn't happen...
    // but if it does we need to have some known path fallback so things don't explode
    if(dataDirVal === undefined) {
        dataDirVal = getPathFromCWD('./config'); // defaulting to same directory for backwards compatibility
    }
    // resolve from relative directory, if one was used
    return path.resolve(dataDirVal);
}

export const getLogsDir = (): string => {
    let dataDirVal: string = process.env.LOGS_DIR ?? // user-defined OR used by Dockerfile. For Dockerfile this is DATA_DIR/logs
    process.env.LOGS_DIRECTORY ?? // set by systemd
    osPaths.log; // os-specific path

    // this shouldn't happen...
    // but if it does we need to have some known path fallback so things don't explode
    if(dataDirVal === undefined) {
        dataDirVal = getPathFromCWD('./config/logs'); // defaulting to same directory for backwards compatibility
    }
    // resolve from relative directory, if one was used
    return path.resolve(dataDirVal);
}

export const getPathFromCWD = (...relativePaths: string[]) => path.resolve(process.cwd(), ...relativePaths);