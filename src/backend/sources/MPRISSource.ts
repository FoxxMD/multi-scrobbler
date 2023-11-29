import dbus, {ClientInterface, Variant} from 'dbus-next';
import dayjs from "dayjs";
import {
    MPRIS_IFACE,
    MPRIS_PATH,
    MPRISMetadata,
    MPRISSourceConfig,
    PLAYBACK_STATUS_STOPPED,
    PlaybackStatus,
    PlayerInfo,
    PROPERTIES_IFACE,
} from "../common/infrastructure/config/source/mpris";
import { FormatPlayObjectOptions, InternalConfig } from "../common/infrastructure/Atomic";
import MemorySource from "./MemorySource";
import { RecentlyPlayedOptions } from "./AbstractSource";
import { removeDuplicates } from "../utils";
import EventEmitter from "events";
import {ErrorWithCause} from "pony-cause";
import { PlayObject } from "../../core/Atomic";


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

    initialize = async () => {
        // test if we can get DBus
        try {
            await this.getDBus();
            return true;
        } catch (e) {
            this.logger.error('Could not get DBus interface from operating system');
            this.logger.error(e);
            return false;
        }
    }

    protected getDBus = async () => {
        const bus = dbus.sessionBus();
        const obj = await bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus');
        return obj.getInterface('org.freedesktop.DBus');
    }

    protected listAll = async () => {
        let iface = await this.getDBus();
        let names = await iface.ListNames();
        return names.filter((n) => n.startsWith('org.mpris.MediaPlayer2'))
    }

    getPlayersInfo = async (activeOnly = true): Promise<PlayerInfo[]> => {
        const list = await this.listAll();

        let bus = dbus.sessionBus();

        const playerInfos: PlayerInfo[] = [];

        for (const playerName of list) {
            const plainPlayerName = playerName.replace('org.mpris.MediaPlayer2.', '');
            try {
                let obj = await bus.getProxyObject(playerName, MPRIS_PATH);

                //let player = obj.getInterface(MPRIS_IFACE);
                let props = obj.getInterface(PROPERTIES_IFACE);

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
            } catch (e) {
                this.logger.warn(new ErrorWithCause(`Could not parse D-bus info for player ${plainPlayerName}`, {cause: e}));
            }
        }
        return playerInfos;
    }

    protected getPlayerPosition = async (props: ClientInterface): Promise<number> => {
        try {
            const pos = await props.Get(MPRIS_IFACE, 'Position');
            return dayjs.duration({milliseconds: Number(pos.value / 1000n)}).asSeconds();
        } catch(e) {
            throw new ErrorWithCause('Could not get player Position', {cause: e});
        }
    }

    protected getPlayerStatus = async (props: ClientInterface): Promise<PlaybackStatus> => {
        try {
            const status = await props.Get(MPRIS_IFACE, 'PlaybackStatus');
            return status.value as PlaybackStatus;
        } catch (e) {
            throw new ErrorWithCause('Could not get player PlaybackStatus', {cause: e})
        }
    }

    protected getPlayerMetadata = async (props: ClientInterface): Promise<MPRISMetadata> => {
        try {
            const metadata = await props.Get(MPRIS_IFACE, 'Metadata');
            return this.metadataToPlain(metadata.value);
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
            if (value instanceof Variant) {
                if (typeof value.value === 'bigint') {
                    // in this context we're using it as a duration (track length or playback position)
                    metadataPlain[plainKey] = dayjs.duration({milliseconds: Number(value.value / 1000n)}).asSeconds();
                } else {
                    metadataPlain[plainKey] = value.value;
                }
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


