import * as path from 'path';
import envPaths from 'env-paths';

const osPaths = envPaths('multi-scrobbler', {suffix: ''});

// see https://docs.multi-scrobbler.app/installation/#config-and-data-directories
// for systemd see: https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#:~:text=Table%C2%A02%2E%C2%A0Automatic%20directory%20creation%20and%20environment%20variables
// for os-specific like (linux) XDG, (mac) ~Library/..., (window) %APPDATA%\... or %LOCALAPPDATA%\...

export type DirCandidates = [string,string?][];
export const printDirCandidates = (candidates: DirCandidates): string => candidates.map((x) => `${x[0]} : ${x[1] ?? '(not set)'}`).join('\n');

export const getConfigDirCandidates = (): DirCandidates => {
    const candidates: DirCandidates = [
        [`CONFIG_DIR`, process.env.CONFIG_DIR], // user-defined OR used by Dockerfile
        [`CONFIGURATION_DIRECTORY`, process.env.CONFIGURATION_DIRECTORY], // set by systemd
        ['OS-Specific', osPaths.config] // os-specific path
    ];

    return candidates;
}
export const getConfigDir = (): string => {
    let configDirVal: string | undefined = getConfigDirCandidates().find(x => x[1] !== undefined)?.[1];

    // this shouldn't happen...
    // but if it does we need to have some known path fallback so things don't explode
    if(configDirVal === undefined) {
        configDirVal = getPathFromCWD('./config'); // backwards compatibility
    }
    // resolve from relative directory, if one was used
    return path.resolve(configDirVal);
}

export const getDataDirCandidates = (): DirCandidates => {
    const candidates: DirCandidates = [
        [`DATA_DIR`, process.env.DATA_DIR], // user-defined OR used by Dockerfile
        [`STATE_DIRECTORY`, process.env.STATE_DIRECTORY], // set by systemd
        ['OS-Specific', osPaths.data] // os-specific path
    ];

    return candidates;
}
export const getDataDir = (): string => {
    let dataDirVal: string | undefined = getDataDirCandidates().find(x => x[1] !== undefined)?.[1];

    // this shouldn't happen...
    // but if it does we need to have some known path fallback so things don't explode
    if(dataDirVal === undefined) {
        dataDirVal = getPathFromCWD('./config'); // defaulting to same directory for backwards compatibility
    }
    // resolve from relative directory, if one was used
    return path.resolve(dataDirVal);
}

export const getLogsDirCandidates = (): DirCandidates => {
    const candidates: DirCandidates = [
        [`LOGS_DIR`, process.env.LOGS_DIR], // user-defined OR used by Dockerfile. For Dockerfile this is DATA_DIR/logs
        [`LOGS_DIRECTORY`, process.env.LOGS_DIRECTORY], // set by systemd
        ['OS-Specific', osPaths.log]  // os-specific path
    ];

    return candidates;
}
export const getLogsDir = (): string => {
    let dataDirVal: string | undefined = getDataDirCandidates().find(x => x[1] !== undefined)?.[1];

    // this shouldn't happen...
    // but if it does we need to have some known path fallback so things don't explode
    if(dataDirVal === undefined) {
        dataDirVal = getPathFromCWD('./config/logs'); // defaulting to same directory for backwards compatibility
    }
    // resolve from relative directory, if one was used
    return path.resolve(dataDirVal);
}

export const getPathFromCWD = (...relativePaths: string[]) => path.resolve(process.cwd(), ...relativePaths);