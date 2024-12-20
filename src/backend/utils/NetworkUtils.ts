import { Logger } from "@foxxmd/logging";
import { parseRegexSingle } from "@foxxmd/regex-buddy-core";
import address from "address";
import net from 'node:net';
import normalizeUrl from "normalize-url";
import { join as joinPath } from "path";
import { getFirstNonEmptyVal, isDebugMode, parseRegexSingleOrFail } from "../utils.js";
import { URLData } from "../../core/Atomic.js";

export interface PortReachableOpts {
    host: string,
    timeout?: number
}
/**
 * Copied from https://github.com/sindresorhus/is-port-reachable with error reporting
 * */
export const isPortReachable = async (port: number, opts: PortReachableOpts) => {
    const {host, timeout = 1000} = opts;

    const promise = new Promise(((resolve, reject) => {
        const socket = new net.Socket();

        const onError = (e) => {
            socket.destroy();
            reject(e);
        };
        const onTimeout = () => {
            socket.destroy();
            reject(new Error(`Connection timed out after ${timeout}ms`));
        }

        socket.setTimeout(timeout);
        socket.once('error', onError);
        socket.once('timeout', onTimeout);

        socket.connect(port, host, () => {
            socket.end();
            resolve(true);
        });
    }));

    try {
        await promise;
        return true;
    } catch (e) {
        throw e;
    }
}

const QUOTES_UNWRAP_REGEX: RegExp = new RegExp(/^"(.*)"$/);

export const normalizeWebAddress = (val: string): URLData => {
    let cleanUserUrl = val.trim();
    const results = parseRegexSingle(QUOTES_UNWRAP_REGEX, val);
    if (results !== undefined && results.groups && results.groups.length > 0) {
        cleanUserUrl = results.groups[0];
    }

    let normal = normalizeUrl(cleanUserUrl, {removeTrailingSlash: true});
    const u = new URL(normal);
    let port: number;

    if (u.port === '') {
        port = u.protocol === 'https:' ? 443 : 80;
    } else {
        port = parseInt(u.port);
        // if user val does not include protocol and port is 443 then auto set to https
        if(port === 443 && !val.includes('http')) {
            if(u.protocol === 'http:') {
                u.protocol = 'https:';
            }
            normal = normal.replace('http:', 'https:');
        }
    }
    return {
        url: u,
        normal,
        port
    }
}

export const generateBaseURL = (userUrl: string | undefined, defaultPort: number | string): URL => {
    const urlStr = userUrl ?? `http://localhost:${defaultPort}`;
    let cleanUserUrl = urlStr.trim();
    const results = parseRegexSingle(QUOTES_UNWRAP_REGEX, cleanUserUrl);
    if (results !== undefined && results.groups && results.groups.length > 0) {
        cleanUserUrl = results.groups[0];
    }
    const base = normalizeUrl(cleanUserUrl, {removeSingleSlash: true});
    const u = new URL(base);
    if (u.port === '') {
        if (u.protocol === 'https:') {
            u.port = '443';
        } else if (userUrl.includes(`${u.hostname}:80`)) {
            u.port = '80';
        } else {
            u.port = defaultPort.toString();
        }
    }
    return u;
}
export const joinedUrl = (url: URL, ...paths: string[]): URL => {
    // https://github.com/jfromaniello/url-join#in-nodejs
    const finalUrl = new URL(url);
    finalUrl.pathname = joinPath(url.pathname, ...(paths.filter(x => x.trim() !== '')));
    return finalUrl;
}
export const getAddress = (host = '0.0.0.0', logger?: Logger): { v4?: string, v6?: string, host: string } => {
    const local = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
    let v4: string,
        v6: string;
    try {
        v4 = address.ip();
        v6 = address.ipv6();
    } catch (e) {
        if (isDebugMode()) {
            if (logger !== undefined) {
                logger.warn(new Error('Could not get machine IP address', {cause: e}));
            } else {
                console.warn('Could not get machine IP address');
                console.warn(e);
            }
        }
    }
    return {
        host: local,
        v4,
        v6
    };
}
const IPV4_REGEX = new RegExp(/^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/);
export const isIPv4 = (address: string): boolean => {
    return parseRegexSingleOrFail(IPV4_REGEX, address) !== undefined;
}
