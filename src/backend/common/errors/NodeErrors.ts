import { isArbitraryObject } from "../infrastructure/Atomic.js";
import ErrnoException = NodeJS.ErrnoException;
import { findCauseByFunc } from "../../utils.js";

export type NodeNetworkErrorCode = 'ENOTFOUND' | 'ETIMEDOUT' | 'EAI_AGAIN' | 'ECONNRESET' | 'ECONNREFUSED' | 'ERRADDRINUSE' | 'EADDRNOTAVAIL' | 'ECONNABORTED' | 'EHOSTUNREACH';
export const NETWORK_ERROR_CODES = ['ENOTFOUND', 'ETIMEDOUT',  'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ERRADDRINUSE', 'EADDRNOTAVAIL', 'ECONNABORTED', 'EHOSTUNREACH'];

export const isErrnoException = (error: unknown): error is ErrnoException => {
    return isArbitraryObject(error) &&
        error instanceof Error &&
        (typeof error.errno === "number" || typeof error.errno === "undefined") &&
        (typeof error.code === "string" || typeof error.code === "undefined") &&
        (typeof error.path === "string" || typeof error.path === "undefined") &&
        (typeof error.syscall === "string" || typeof error.syscall === "undefined");
}

export interface NodeNetworkException extends ErrnoException {
    code: NodeNetworkErrorCode
}

export const isNodeNetworkException = (error: unknown): error is NodeNetworkException => {
    return isErrnoException(error) && NETWORK_ERROR_CODES.includes(error.code);
}

export const hasNodeNetworkException = (error: unknown): boolean => {
    return getNodeNetworkException(error) !== undefined;
}

export const getNodeNetworkException = (error: unknown): Error | undefined => {
    return findCauseByFunc(error, isNodeNetworkException);
}
