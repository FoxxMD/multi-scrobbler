import { childLogger } from "@foxxmd/logging";
import { MSCache } from "../../Cache.js";
import { AbstractApiOptions, SourceData } from "../../infrastructure/Atomic.js";
import { ActivityData, DiscordIPCData, DiscordStrongData } from "../../infrastructure/config/client/discord.js";
import AbstractApiClient from "../AbstractApiClient.js";
import { CoverArtApiClient } from "../musicbrainz/CoverArtApiClient.js";
import EventEmitter from "events";
import { getRoot } from "../../../ioc.js";
import { Client, SetActivity } from "@xhayper/discord-rpc";
import {realpathSync} from 'fs';
import {sep, join} from 'path';
import { PathData } from "@xhayper/discord-rpc/dist/transport/IPC.js";
import { removeUndefinedKeys } from "../../../utils.js";
import { playStateToActivityData } from "./DiscordUtils.js";

export class DiscordIPCClient extends AbstractApiClient {

    declare config: DiscordIPCData;

    ready: boolean = false;

    emitter: EventEmitter;
    cache: MSCache;
    covertArtApi: CoverArtApiClient;
    artFail: boolean = false;
    artFailCount = 0;

    declare client: Client;

    constructor(name: any, config: DiscordStrongData, options: AbstractApiOptions) {
        const ipcData = configToIPCConfig(config);
        super('IPC', name, ipcData, options);
        this.logger = childLogger(options.logger);
        this.emitter = new EventEmitter();
        this.cache = getRoot().items.cache();
        this.covertArtApi = getRoot().items.coverArtApi;
    }

    async initClient() {
        const {
            ipcLocations = []
        } = this.config;
        const pathList: PathData[] = [...ipcLocations.map(x => ({platform: typeof x === 'string' ? ['linux','darwin'] as NodeJS.Platform[] : ['linux','darwin','win32'] as NodeJS.Platform[], format: (_) =>  x})), ...defaultPathList];
        const canidatePaths = pathList.filter(x => x.platform.includes(process.platform));
        const candidateHint = canidatePaths.map(x => {
            const res = x.format(0);
            if(typeof res === 'string') {
                return res;
            }
            return `${res[1]}:${res[0]}`;
        })
        this.logger.verbose(`Candidate IPC Paths:\n${candidateHint.join('\n')}`);
        this.client = new Client({
            clientId: this.config.applicationId,
            transport: {
                type: "ipc",
                pathList: canidatePaths
            }
        });
        this.client.on("ready", async () => {
            this.ready = true;
            this.logger.info('IPC Connection READY');
            
        });
        this.client.on('error', (e) => {
            this.logger.error(e);
        });
        this.client.on('debug', (e) => {
            this.logger.debug(e);
        });
        this.client.on("close", (e) => {
            this.ready = false;
        });
     }

    async tryConnect() {
        try {
            await this.client.login();
        } catch(e) {
            throw new Error('Unable to connect to Discord Client using IPC', {cause: e});
        }
    }

    async sendActivity(data?: SourceData | undefined) {
        if(data === undefined) {
            this.sendClearActivity();
            return;
        }
        const {activity: msActivity, artUrl} = playStateToActivityData(data);
        const activity = activityDataToSetActivity(msActivity);

         this.client.user?.setActivity(activity);
    }

    async sendClearActivity() {
        await this.client.user.clearActivity();
    }
}

export const configToIPCConfig = (data: DiscordStrongData): DiscordIPCData => {
    if(data.applicationId === undefined) {
        throw new Error('Must contain applicationId');
    }
    const {
        ipcLocations = []
    } = data;
    const parsedPaths: (string | [number, string])[] = [];
    for(const p of ipcLocations) {
        const sp = p.split(':');
        if(sp.length > 1) {
            parsedPaths.push([parseInt(sp[1]), sp[0]]);
        } else {
            parsedPaths.push(p);
        }
    }
    return {
        ...data,
        ipcLocations: parsedPaths
    } as DiscordIPCData;
}

const getTempDir = () => {
    const { XDG_RUNTIME_DIR, TMPDIR, TMP, TEMP } = process.env;
    return realpathSync(XDG_RUNTIME_DIR ?? TMPDIR ?? TMP ?? TEMP ?? `${sep}tmp`);
};

const defaultPathList: PathData[] = [
    {
        platform: ["win32"],
        format: (id) => `\\\\?\\pipe\\discord-ipc-${id}`
    },
    {
        platform: ["darwin", "linux"],
        format: (id) => {
            // macOS / Linux path
            return join(getTempDir(), `discord-ipc-${id}`);
        }
    },
    {
        platform: ["linux"],
        format: (id) => {
            // snap
            return join(getTempDir(), "snap.discord", `discord-ipc-${id}`);
        }
    },
    {
        platform: ["linux"],
        format: (id) => {
            // flatpak
            return join(getTempDir(), "app", "com.discordapp.Discord", `discord-ipc-${id}`);
        }
    }
];

export const activityDataToSetActivity = (data: ActivityData): SetActivity => {
    const {
        activityType,
        assets:{
            largeImage,
            largeText,
            largeUrl,
            smallImage,
            smallText,
            smallUrl
        } = {},
        timestamps: {
            start,
            end
        } = {},
        ...rest
    } = data;

    const activity: SetActivity = removeUndefinedKeys<SetActivity>({
        type: activityType,
        largeImageUrl: largeUrl,
        largeImageText: largeText,
        largeImageKey: largeImage,
        smallImageKey: smallImage,
        smallImageText: smallText,
        smallImageUrl: smallUrl,
        startTimestamp: start,
        endTimestamp: end,
        ...rest
    });

    return activity;
}