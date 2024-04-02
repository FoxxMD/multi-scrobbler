import { Response } from 'superagent';

export interface SubsonicResponseCommon {
    status: 'failed' | 'ok'
    version: string
    type: string,
    serverVersion: string
    openSubsonic: boolean
    error?: {
        code: number,
        message: string
    }
    [key: string]: any
}

export interface SubsonicResponseBody<T extends SubsonicResponseCommon = SubsonicResponseCommon> {
    "subsonic-response": T
}

export interface SubsonicResponse extends Response {
    body: SubsonicResponseBody
}

export interface SubsonicNowPlayingResponse extends SubsonicResponseCommon {
    nowPlaying: {
        entry?: EntryData[]
    }
}

export interface EntryData {
    id: string,
    title: string,
    album?: string,
    artist: string,
    /**
     * Length of track in seconds
     * */
    duration: number,
    /**
     * When track began playing relative to now
     *
     * Returned as *whole* minutes so it isn't very accurate
     * */
    minutesAgo: number,
    playerId: string,
    username: string,
}

export const asSubsonicResponseCommon = (obj: unknown): obj is SubsonicResponseCommon => {
    return obj !== null && typeof obj === 'object' && 'status' in obj;
}

export const asSubsonicResponseBody = (obj: unknown): obj is SubsonicResponse => {
    return obj !== null && typeof obj === 'object' && 'subsonic-response' in obj;
}

export const getSubsonicResponse = (resp: Response): SubsonicResponseCommon | undefined => {
    if(asSubsonicResponseBody(resp.body) && asSubsonicResponseCommon(resp.body['subsonic-response'])) {
        return resp.body['subsonic-response'];
    }
    return undefined;
}
