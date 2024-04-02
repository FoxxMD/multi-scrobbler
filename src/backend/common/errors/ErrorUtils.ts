import { ResponseError } from "superagent";

export const isSuperAgentResponseError = (e: any): e is ResponseError => {
    return typeof e === 'object'
        && (
            ('timeout' in e && typeof e.timeout === 'boolean')
            ||
            ('status' in e
            && (typeof e.status === 'number' || e.status === undefined)
            && 'response' in e
            && (typeof e.response === 'object' || e.response === undefined))
        );
}
