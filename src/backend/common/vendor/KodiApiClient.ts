import AbstractApiClient from "./AbstractApiClient.js";
import {ErrorWithCause} from "pony-cause";
import { KodiData } from "../infrastructure/config/source/kodi.js";
import { KodiClient } from 'kodi-api'
import normalizeUrl from "normalize-url";
import {URL} from "url";
import { RecentlyPlayedOptions } from "../../sources/AbstractSource.js";
import { FormatPlayObjectOptions } from "../infrastructure/Atomic.js";
import dayjs from "dayjs";
import { PlayObject } from "../../../core/Atomic.js";

interface KodiDuration {
    hours: number
    milliseconds: number
    minutes: number
    seconds: number
}
interface ActivePlayer {
    playerid: number
    playertype: string
    type: string
}

interface PlayerInfo {
    position: -1 | 0
    time: KodiDuration
    totaltime: KodiDuration
    type: string
}

interface PlayerItem {
    album: string
    albumartist: string[]
    artist: string[]
    duration: number
    id: number
    label: string
    title: string
    type: string
}

export class KodiApiClient extends AbstractApiClient {

    declare config: KodiData

    url: URL;

    token?: string;

    declare client: KodiClient;

    constructor(name: any, config: KodiData, options = {}) {
        super('Kodi', name, config, options);
        const {
            url = 'http://localhost:8080/jsonrpc'
        } = config;
        this.url = KodiApiClient.parseConnectionUrl(url);
        const auth = new Buffer(`${config.username}:${config.password}`).toString('base64');
        this.client = new KodiClient({
            clientType: this.url.protocol.replace(':', '') as ('http' | 'https'),
            //parameterMode: 'object',
            clientOptions: {
                host: this.url.hostname,
                port: this.url.port,
                path: this.url.pathname,
                headers: {
                    Authorization: `Basic ${auth}`
                },
            }
        });
    }

    static parseConnectionUrl(val: string) {
        const normal = normalizeUrl(val, {removeTrailingSlash: true, normalizeProtocol: true})
        const url = new URL(normal);

        if (url.port === null || url.port === '') {
            url.port = '8080';
        }
        if (url.pathname === '/') {
            url.pathname = '/jsonrpc';
        } else if (url.pathname === '/jsonrpc/') {
            url.pathname = '/jsonrpc';
        }
        return url;
    }

    static formatPlayObj(obj: (PlayerItem & Partial<PlayerInfo> & { playerid?: number }), options: FormatPlayObjectOptions = {}): PlayObject {
        const {newFromSource = true} = options;

        const {
            album: albumVal,
            albumartist,
            artist: artistVal,
            duration,
            id,
            title,
            time,
            playerid,
        } = obj;

        const artists = artistVal === null || artistVal === undefined ? [] : artistVal;
        const album = albumVal === null || albumVal === '' ? undefined : albumVal;
        const trackProgressPosition = time !== undefined ? Math.round(dayjs.duration(time).asSeconds()) : undefined;

        return {
            data: {
                track: title,
                album: album,
                albumArtists: albumartist,
                artists,
                duration,
                playDate: dayjs()
            },
            meta: {
                source: 'kodi',
                trackId: id.toString(),
                newFromSource,
                trackProgressPosition,
                deviceId: playerid !== undefined ? `Player${playerid}` : undefined,
            }
        }
    }

    testConnection = async () => {
        return true;
    }

    testAuth = async () => {
        try {

            await this.client.connect();
            // https://kodi.wiki/view/JSON-RPC_API/v12#JSONRPC.Version
            const jsonInfo = await this.client.JSONRPC.Version();

            // https://kodi.wiki/view/JSON-RPC_API/v12#Application.GetProperties
            const applicationInfo = await this.client.Application.GetProperties(['version']);

            this.logger.info(`Found Kodi v${applicationInfo.version.major}.${applicationInfo.version.minor} (JSONRPC v${jsonInfo.version.major}.${jsonInfo.version.minor})`);
            return true;
        } catch (e) {
            let msg = 'Authentication failed.';
            if(this.config.username === undefined || this.config.password === undefined) {
                msg = 'Authentication failed. No username/password was provided in config! Did you mean to do this?';
            }
            this.logger.error(new ErrorWithCause(msg, {cause: e}));
            return false;
        }
    }

    getPlayerInfo = async (id: number): Promise<PlayerInfo> => {
        // https://kodi.wiki/view/JSON-RPC_API/v12#Player.GetProperties
        // @ts-expect-error types are wrong
        const playerInfo = await this.client.Player.GetProperties(0, ["position","type","time","totaltime"])
        return playerInfo;
    }

    getPlayerItem = async (id: number): Promise<{item: PlayerItem}> => {
        // https://kodi.wiki/view/JSON-RPC_API/v12#Player.GetItem
        // @ts-expect-error types are wrong
        const itemInfo = await this.client.Player.GetItem(0, ["title","artist","album","albumartist","starttime","endtime","duration","streamdetails","uniqueid"]);
        return itemInfo as {item: PlayerItem};
    }

    getActivePlayers = async (): Promise<ActivePlayer[]> => {
        // https://kodi.wiki/view/JSON-RPC_API/v12#Player.GetActivePlayers
        const players = await this.client.Player.GetActivePlayers();
        return players as ActivePlayer[];
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        const active = await this.getActivePlayers();
        if(active.length === 0) {
            return [];
        }
        // get first active playing audio
        const audioActive = active.find(x => x.type === 'audio');
        if(audioActive === undefined) {
            return [];
        }
        const playerInfo = await this.getPlayerInfo(audioActive.playerid);

        const itemInfo = await this.getPlayerItem(audioActive.playerid);

        const play = KodiApiClient.formatPlayObj({...itemInfo.item, ...playerInfo, ...audioActive});

        return [play];
    }
}
