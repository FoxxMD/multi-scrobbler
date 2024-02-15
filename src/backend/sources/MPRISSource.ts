import dayjs from "dayjs";
import {
    MPRIS_IFACE,
    MPRIS_PATH,
    MPRISMetadata,
    MPRISSourceConfig,
    PLAYBACK_STATUS_STOPPED,
    PlaybackStatus,
    PlayerInfo,
} from "../common/infrastructure/config/source/mpris.js";
import { FormatPlayObjectOptions, InternalConfig } from "../common/infrastructure/Atomic.js";
import MemorySource from "./MemorySource.js";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import { removeDuplicates } from "../utils.js";
import EventEmitter from "events";
import {ErrorWithCause} from "pony-cause";
import { PlayObject } from "../../core/Atomic.js";
import {DBusInterface, sessionBus} from 'dbus-ts';
import { Interfaces as Notifications } from '@dbus-types/notifications'


export class MPRISSource extends MemorySource {

    declare config: MPRISSourceConfig;

    whitelist: string[] = [];
    blacklist: string[] = [];

    multiPlatform: boolean = true;

    constructor(name: any, config: MPRISSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('mpris', name, config, internal, emitter);
        this.canPoll = true;

        const {data: {whitelist = [], blacklist = []} = {}} = config;
        if(!Array.isArray(whitelist)) {
            this.whitelist = whitelist.split(',')
        } else {
            this.whitelist = whitelist;
        }
        if(!Array.isArray(blacklist)) {
            this.blacklist = blacklist.split(',');
        } else {
            this.blacklist = blacklist;
        }
    }

    static formatPlayObj(obj: PlayerInfo, options: FormatPlayObjectOptions = {}): PlayObject {
        const {newFromSource = false} = options;
        const {
            name,
            position,
            metadata: {
                length,
                album,
                artist = [],
                albumArtist = [],
                title,
                trackid,
                url,
            } = {}
        } = obj;

        let actualAlbumArtists: string[] = [];
        if(albumArtist.filter(x => !artist.includes(x)).length > 0) {
            // only include album artists if they are not the EXACT same as the track artists
            // ...if they aren't the exact same then include all artists, even if they are duplicates of track artists
            actualAlbumArtists = albumArtist;
        }

        return {
            data: {
                track: title,
                album,
                artists: artist,
                albumArtists: actualAlbumArtists,
                duration: length,
                playDate: dayjs()
            },
            meta: {
                source: 'dbus',
                trackId: trackid,
                newFromSource,
                url: {
                    web: url
                },
                trackProgressPosition: position,
                deviceId: name,
            }
        }
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        // test if we can get DBus
        try {
            await this.getDBus();
            return true;
        } catch (e) {
            throw new ErrorWithCause('Could not get DBus interface from operating system', {cause: e});
        }
    }

    protected getDBus = async () => {
        const busNew = await sessionBus<Notifications>();
        const obj = await busNew.getInterface('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus');
        return obj;
    }

    protected listNew = async () => {
        let iface = await this.getDBus();
        let names = (await iface.ListNames())[0];
        return names.filter((n) => n.includes('org.mpris.MediaPlayer2'))
    }

    getPlayersInfo = async (activeOnly = true): Promise<PlayerInfo[]> => {

        const busNew = await sessionBus<Notifications>();

        const playerInfos: PlayerInfo[] = [];

        const newList = await this.listNew();

        for (const playerName of newList) {
            const plainPlayerName = playerName.replace('org.mpris.MediaPlayer2.', '');
            try {
                let props = await busNew.getInterface(playerName, MPRIS_PATH, MPRIS_IFACE);
                // may not always have position available! can fallback to undefined for this
                let pos: number | undefined;
                try {
                    pos = await this.getPlayerPosition(props);
                } catch (e) {
                    this.logger.warn(`Could not get Position info for player ${plainPlayerName}`);
                }
                const status = await this.getPlayerStatus(props);
                if (status === PLAYBACK_STATUS_STOPPED && activeOnly) {
                    continue;
                }
                const metadata = await this.getPlayerMetadata(props);
                playerInfos.push({
                    name: plainPlayerName,
                    status,
                    position: pos,
                    metadata
                });
            }
            catch (e) {
                this.logger.warn(new ErrorWithCause(`Could not parse D-bus info for player ${plainPlayerName}`, {cause: e}));
            }

        }

        return playerInfos;
    }

    protected getPlayerPosition = async (props: DBusInterface): Promise<number> => {
        try {
            const pos = await props['Position'];
            // microseconds
            return dayjs.duration({milliseconds: Number(pos / 1000)}).asSeconds();
        } catch(e) {
            throw new ErrorWithCause('Could not get player Position', {cause: e});
        }
    }

    protected getPlayerStatus = async (props: DBusInterface): Promise<PlaybackStatus> => {
        try {
            const status = await props['PlaybackStatus'];
            return status as PlaybackStatus;
        } catch (e) {
            throw new ErrorWithCause('Could not get player PlaybackStatus', {cause: e})
        }
    }

    protected getPlayerMetadata = async (props: DBusInterface): Promise<MPRISMetadata> => {
        try {
            const metadata = await props['Metadata'];
            return this.metadataToPlain(metadata);
        } catch(e) {
            throw new ErrorWithCause('Could not get player Metadata', {cause: e});
        }
    }

    metadataToPlain = (metadataVariant): MPRISMetadata => {
        let metadataPlain = {};
        for (let k of Object.keys(metadataVariant)) {
            let value = metadataVariant[k];
            if (value === undefined || value === null) {
                //logging.warn(`ignoring a null metadata value for key ${k}`);
                continue;
            }
            const plainKey = k.replace(/mpris:|xesam:/, '');
            if(plainKey === 'length' && typeof value === 'number') {
                // microseconds to seconds
                metadataPlain[plainKey] = value / 1000000
            } else {
                metadataPlain[plainKey] = value;
            }
        }
        return metadataPlain;
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        const infos = await this.getPlayersInfo();
        let plays: PlayObject[] = [];
        for(const info of infos) {
            const lowerName = info.name.toLocaleLowerCase();
            if(this.whitelist.length > 0) {
                if(!this.whitelist.some(x => lowerName.includes(x.toLocaleLowerCase()))) {
                    this.logger.debug(`No name in whitelist was found in Player Name '${info.name}', skipping player`);
                    continue;
                }
            } else if(this.blacklist.length > 0) {
                if(this.whitelist.some(x => lowerName.includes(x.toLocaleLowerCase()))) {
                    this.logger.debug(`A name in blacklist was found in Player Name '${info.name}', skipping player`);
                    continue;
                }
            }
            plays.push(MPRISSource.formatPlayObj(info));
        }
        const deduped = removeDuplicates(plays);
        if(options.display === true) {
            return deduped;
        }
        return this.processRecentPlays(deduped);
    }
}


