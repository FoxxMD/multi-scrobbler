import { childLogger } from "@foxxmd/logging";
import { AbstractApiOptions, SourceData } from "../../infrastructure/Atomic.js";
import { ActivityData, DiscordIPCData, DiscordStrongData } from "../../infrastructure/config/client/discord.js";
import EventEmitter from "events";
import { getRoot } from "../../../ioc.js";
import { Client, SetActivity } from "@xhayper/discord-rpc";
import {realpathSync} from 'fs';
import {sep, join} from 'path';
import { PathData } from "@xhayper/discord-rpc/dist/transport/IPC.js";
import { removeUndefinedKeys } from "../../../utils.js";
import { playStateToActivityData } from "./DiscordUtils.js";
import { DiscordAbstractClient } from "./DiscordAbstractClient.js";
import dayjs from "dayjs";
import { isPlayObject } from "../../../../core/Atomic.js";

export class DiscordIPCClient extends DiscordAbstractClient {

    declare config: DiscordIPCData;

    activityTimeout?: NodeJS.Timeout;

    ready: boolean = false;

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
            this.emitter.emit('ready', {ready: true});
        });
        this.client.on('error', (e) => {
            this.logger.error(e);
        });
        this.client.on('debug', (e) => {
            this.logger.debug(e);
        });
        this.client.on("close", (e) => {
            this.ready = false;
            clearTimeout(this.activityTimeout);
            this.activityTimeout = undefined;
            this.emitter.emit('stopped', { authFailure: false });
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
        if (data === undefined) {
            await this.sendClearActivity();
            return;
        }
        const { activity: msActivity, artUrl } = playStateToActivityData(data);
        const assets = await this.getArtAsset(data, artUrl);
        if (assets !== undefined) {
            const {
                assets: msAssets = {}
            } = msActivity;
            msActivity.assets = {
                ...msAssets,
                ...assets
            }
        }
        const activity = activityDataToSetActivity(msActivity);
        await this.client.user?.setActivity(activity);

        const play = isPlayObject(data) ? data : data.play;

        let clearTime = dayjs().add(260, 'seconds'); // funny number
        if (msActivity.timestamps?.end !== undefined) {
            clearTime = dayjs.unix(Math.floor(msActivity.timestamps.end as number / 1000));
        } else if (play.data?.duration !== undefined) {
            clearTime = dayjs().add(play.data.duration, 'seconds')
        }
        if (this.activityTimeout !== undefined) {
            clearTimeout(this.activityTimeout);
        }
        this.activityTimeout = setTimeout(() => {
            this.sendClearActivity();
        }, Math.abs(clearTime.diff(dayjs(), 'ms')));
    }

    async sendClearActivity() {
        if (this.activityTimeout !== undefined) {
            clearTimeout(this.activityTimeout);
            this.activityTimeout = undefined;
        }
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
        if(Array.isArray(p)) {
            parsedPaths.push(p)
        } else {
            const sp = p.split(':');
            if(sp.length > 1) {
                parsedPaths.push([parseInt(sp[1]), sp[0]]);
            } else {
                parsedPaths.push(p);
            }
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