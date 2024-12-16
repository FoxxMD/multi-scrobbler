import request, { Request, Response } from 'superagent';
import xml2js from 'xml2js';
import { AbstractApiOptions, DEFAULT_RETRY_MULTIPLIER } from "../infrastructure/Atomic.js";
import { JRiverData } from "../infrastructure/config/source/jriver.js";
import AbstractApiClient from "./AbstractApiClient.js";

const parser = new xml2js.Parser({'async': true});

export const PLAYER_STATE: Record<string, PLAYER_STATE> = {
    STOPPED: '0',
    PAUSED: '1',
    PLAYING: '2'
}

export type PLAYER_STATE = '0' | '1' | '2';

interface JRiverResponseItem {
    _: string
    $: {
        Name: string
    }
}

interface JRiverResponse {
    Response: {
        '$': {
            Status: string
        },
        Item: JRiverResponseItem[]
    }
}

export interface JRiverTransformedResponse<T> {
    status: string
    data?: T
}

export interface Alive {
    RuntimeGUID: string
    LibraryVersion: string
    ProgramName: string
    ProgramVersion: string
    FriendlyName: string
    AccessKey: string
    ProductVersion: string
    Platform: string
}
// state 0 = nothing?
// 2 = playing
// 1 = paused

export interface Authenticate {
    Token: string
    ReadOnly: number
    PreLicensed: boolean
}

export interface Info {
    ZoneID: string
    ZoneName: string
    State: PLAYER_STATE
    PositionMS: number
    DurationMS: number
    Artist: string
    Album: string
    Name: string
    Status: string
    FileKey: string
}

export interface Zones {
    NumberZones: number
    CurrentZoneID: string
    CurrentZoneIndex: string
}

const jriverResponseTransform = <T>(val: JRiverResponse): JRiverTransformedResponse<T> => {
    const status = val.Response.$.Status;
    const items = val.Response.Item === undefined ? undefined : val.Response.Item.map(x => {
        return [x.$.Name, x._];
    });
    return {
        status,
        data: items.reduce((acc, curr) => {
            acc[curr[0]] = curr[1];
            return acc;
        }, {}) as T
    };
}

export class JRiverApiClient extends AbstractApiClient {

    declare config: JRiverData

    url: string;

    token?: string;

    constructor(name: any, config: JRiverData, options: AbstractApiOptions) {
        super('JRiver', name, config, options);
        const {
            url = 'http://localhost:52199/MCWS/v1/'
        } = config;
        this.url = url;
    }

    callApi = async <T>(req: Request, retries = 0): Promise<Response & {body: T}> => {
        const {
            maxRequestRetries = 2,
            retryMultiplier = DEFAULT_RETRY_MULTIPLIER
        } = this.config;

        if (this.token !== undefined) {
            req.query({token: this.token});
        }

        try {
            const resp = await req as Response;
            if (resp.text !== '') {
                const rawBody = await parser.parseStringPromise(resp.text);
                resp.body = <T>jriverResponseTransform(rawBody);
            }
            return resp;
        } catch (e) {
            throw e;
        }
    }

    testConnection = async (): Promise<true> => {
        try {
            const resp = await this.callApi<Alive>(request.get(`${this.url}Alive`));
            const {body: { data } = {}} = resp;
            this.logger.verbose(`Found ${data.ProgramName} ${data.ProgramVersion} (${data.FriendlyName})`);
            return true;
        } catch (e) {
            throw new Error('Could not communicate with JRiver server. Verify your server URL is correct.', {cause: e});
        }
    }

    testAuth = async () => {
        try {
            const req = request.get(`${this.url}Authenticate`);
            if (this.config.username !== undefined) {
                req.auth(this.config.username, this.config.password);
            }
            const resp = await this.callApi<Authenticate>(req);
            this.token = resp.body.data.Token;
            return true;
        } catch (e) {
            let msg = 'Authentication failed.';
            if(this.config.username === undefined || this.config.password === undefined) {
                msg = 'Authentication failed. No username/password was provided in config! Did you mean to do this?';
            }
            throw new Error(msg, {cause: e});
        }
    }

    getInfo = async (zoneId: string = '-1') => {
        return await this.callApi<Info>(request.get(`${this.url}Playback/Info`).query({Zone: zoneId}));
    }

    getZones = async () => {
        return await this.callApi<Zones>(request.get(`${this.url}Playback/Zones`));
    }
}
