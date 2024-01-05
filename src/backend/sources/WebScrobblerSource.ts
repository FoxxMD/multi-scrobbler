import MemorySource from "./MemorySource";
import {
    FormatPlayObjectOptions,
    InternalConfig,
    NO_USER,
    PlayerStateData, REPORTED_PLAYER_STATUSES,
    ReportedPlayerStatus
} from "../common/infrastructure/Atomic";
import EventEmitter from "events";
import {PlayObject} from "../../core/Atomic";
import {WebScrobblerHookEvent, WebScrobblerPayload, WebScrobblerSong} from "../common/vendor/webscrobbler/interfaces";
import dayjs from "dayjs";
import {WebScrobblerSourceConfig} from "../common/infrastructure/config/source/webscrobbler";

export class WebScrobblerSource extends MemorySource {

    declare config: WebScrobblerSourceConfig;

    constructor(name: any, config: WebScrobblerSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('webscrobbler', name, config, internal, emitter);
        this.multiPlatform = true;
        this.playerSourceOfTruth = false;

        const {
            data = {},
            data: {
                whitelist = [],
                blacklist = [],
                slug,
            } = {}
        } = this.config;
        const wl = typeof whitelist === 'string' ? [whitelist] : whitelist;
        const bl = typeof blacklist === 'string' ? [blacklist] : blacklist;
        this.config.data = {
            ...data,
            slug: slug === null ? undefined : slug,
            blacklist: bl.map(x => x.toLocaleLowerCase().trim()),
            whitelist: wl.map(x => x.toLocaleLowerCase().trim())
        };
    }

    protected async doBuildInitData(): Promise<boolean | string> {
        this.logger.info(`Accepting requests at ${this.localUrl}/api/webscrobbler${this.config.data.slug === undefined ? '' : `/${this.config.data.slug}`}`);
        return true;
    }

    matchSlug(slug: string | undefined) {
        if (this.config.data.slug === undefined || this.config.data.slug === null) {
            return slug === undefined;
        }

        return slug.toLowerCase() === this.config.data.slug.toLowerCase().trim();
    }

    static webhookEventAsPlayerStatus(event: WebScrobblerHookEvent): ReportedPlayerStatus {
        switch (event) {
            case 'nowplaying':
            case 'scrobble':
            case 'resumedplaying':
                return REPORTED_PLAYER_STATUSES.playing;
            case 'paused':
                return REPORTED_PLAYER_STATUSES.paused;
            default:
                return REPORTED_PLAYER_STATUSES.unknown;
        }
    }

    static playStateFromRequest(obj: WebScrobblerPayload,): PlayerStateData {
        const {
            eventName,
            time = dayjs().unix(),
        } = obj;

        const play = WebScrobblerSource.formatPlayObj(obj.data.song, {nowPlaying: eventName !== 'scrobble'});
        return {
            platformId: [play.meta.deviceId, NO_USER],
            play,
            status: WebScrobblerSource.webhookEventAsPlayerStatus(eventName),
            timestamp: dayjs.unix(time)
        }
    }

    static formatPlayObj(obj: WebScrobblerSong, options: FormatPlayObjectOptions & {
        nowPlaying?: boolean
    } = {}): PlayObject {
        const {
            connectorLabel,
            controllerTabId = 'UNK',
            processed,
            parsed: {
                isScrobblingAllowed = true,
                originUrl,
                uniqueID
            },
            parsed,
            metadata: {
                startTimestamp,
                trackUrl,
                albumMbId,
                label,
            }
        } = obj;

        const track = processed.track ?? parsed.track;
        const artist = processed.artist ?? parsed.artist;
        const album = processed.album ?? parsed.album;
        const albumArtist = processed.albumArtist ?? parsed.albumArtist;
        const duration = parsed.duration ?? processed.duration;

        return {
            data: {
                track,
                artists: [artist],
                album: album === null ? undefined : album,
                albumArtists: albumArtist === null ? undefined : [albumArtist],
                playDate: dayjs.unix(startTimestamp),
                duration: duration === null ? undefined : duration,
                meta: {
                    brainz: {
                        album: albumMbId
                    }
                }
            },
            meta: {
                trackId: uniqueID,
                parsedFrom: connectorLabel,
                url: {
                    web: trackUrl,
                    origin: originUrl
                },
                deviceId: `${connectorLabel}-${controllerTabId}`,
                scrobbleAllowed: isScrobblingAllowed,
                nowPlaying: options.nowPlaying ?? false
            }
        }
    }

    getRecentlyPlayed = async (options = {}) => {
        return this.getFlatRecentlyDiscoveredPlays();
    }

    isValidScrobble = (playObj: PlayObject) => {
        if (playObj.meta?.scrobbleAllowed === false) {
            this.logger.debug(`Will not scrobble play because it was marked as 'Do Not Scrobble' by extension`);
            return false;
        }

        if (playObj.meta.parsedFrom !== undefined) {
            const lowerSource = playObj.meta.parsedFrom.toLowerCase();
            if (Array.isArray(this.config.data.blacklist) && this.config.data.blacklist.length > 0) {
                if (this.config.data.blacklist.some(x => x === lowerSource)) {
                    this.logger.debug(`Will not scrobble play because it is from a blacklisted connector '${lowerSource}'`);
                    return false;
                }
            }
            if (Array.isArray(this.config.data.whitelist) && this.config.data.whitelist.length > 0) {
                if (!this.config.data.whitelist.some(x => x === lowerSource)) {
                    this.logger.debug(`Will not scrobble play because it is not from a whitelisted connector '${lowerSource}'`);
                    return false;
                }
            }
        }

        return true;
    }

    handle = async (stateData: PlayerStateData) => {

        this.processRecentPlays([stateData]);

        if (stateData.play.meta.nowPlaying === false && this.isValidScrobble(stateData.play)) {
            const discovered = this.discover([stateData.play]);
            if (discovered.length > 0) {
                this.scrobble(discovered);
            }
        }
    }
}
