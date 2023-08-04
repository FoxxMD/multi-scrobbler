import MemorySource from "./MemorySource.js";
import dayjs from "dayjs";
import {buildTrackString, combinePartsToString, parseDurationFromTimestamp, truncateStringToLength} from "../utils.js";
import {JellySourceConfig} from "../common/infrastructure/config/source/jellyfin.js";
import {FormatPlayObjectOptions, InternalConfig, PlayObject} from "../common/infrastructure/Atomic.js";
import EventEmitter from "events";

const shortDeviceId = truncateStringToLength(10, '');

export default class JellyfinSource extends MemorySource {
    users;
    servers;

    multiPlatform: boolean = true;

    declare config: JellySourceConfig;

    constructor(name: any, config: JellySourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('jellyfin', name, config, internal, emitter);
        const {
            data: {
            users,
            servers,
            options: {
                logFilterFailure = 'warn'
                } = {}
            } = {}
        } = config;

        if(logFilterFailure !== false && !['debug', 'warn'].includes(logFilterFailure)) {
            this.logger.warn(`logFilterFailure value of '${logFilterFailure.toString()}' is NOT VALID. Logging will not occur if filters fail. You should fix this.`);
        }

        if (users === undefined || users === null) {
            this.users = undefined;
        } else {
            if (!Array.isArray(users)) {
                if(users.trim() === '') {
                    this.users = undefined;
                } else {
                    this.users = users.split(',').map(x => x.trim());
                }
            } else {
                this.users = users;
            }
            if(this.users !== undefined) {
                this.users = this.users.map((x: any) => x.toLocaleLowerCase())
            }
        }

        if (servers === undefined || servers === null) {
            this.servers = undefined;
        } else {
            if (!Array.isArray(servers)) {
                if(servers.trim() === '') {
                    this.servers = undefined;
                } else {
                    this.servers = servers.split(',').map(x => x.trim());
                }
            } else {
                this.servers = servers;
            }
            if(this.servers !== undefined) {
                this.servers = this.servers.map((x: any) => x.toLocaleLowerCase());
            }
        }

        if (users === undefined && servers === undefined) {
            this.logger.warn('Initializing, but with no filters! All tracks from all users on all servers will be scrobbled.');
        } else {
            this.logger.info(`Initializing with the following filters => Users: ${this.users === undefined ? 'N/A' : this.users.join(', ')} | Servers: ${this.servers === undefined ? 'N/A' : this.servers.join(', ')}`);
        }
        this.initialized = true;
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions = {}): PlayObject {
        const {newFromSource = false} = options;
        let nfs = newFromSource;
        const {
            ServerId,
            ServerName,
            ServerVersion,
            NotificationUsername,
            UserId,
            NotificationType,
            SaveReason,
            Played,
            UtcTimestamp,
            LastPlayedDate,
            Album,
            Artist,
            Name,
            RunTime,
            ItemId,
            ItemType,
            PlaybackPosition,
            connectionId,
            DeviceId = '',
            DeviceName,
            ClientName,
            Provider_musicbrainzalbumartist,
            Provider_musicbrainzartist,
            Provider_musicbrainzalbum,
            Provider_musicbrainztrack,
            Provider_musicbrainzreleasegroup
        } = obj;

        const dur = parseDurationFromTimestamp(RunTime);

        let server = ServerName;
        if(server === undefined || server === '') {
            server = ServerId;
        }
        if(server === undefined  || server === '') {
            server = connectionId;
        }

        let artists = [];
        if(Artist !== undefined) {
            artists = [Artist];
        }

        let eventReason = SaveReason;
        let playDate = dayjs();
        if(NotificationType === 'UserDataSaved' && SaveReason === 'PlaybackFinished' && LastPlayedDate !== undefined) {
            nfs = false;
            playDate = dayjs(LastPlayedDate);
            if(Played !== true) {
                eventReason = 'PlaybackFinished-NOTPLAYED'
            } else {
                // need to check play timestamp vs. current for sanity
                const sanityShort = dayjs().diff(playDate, 'seconds') < 30;
                if(sanityShort) {
                    // if last played ts was less than 30 seconds ago its too early to scrobble (skipped track, essentially)
                    eventReason = 'PlaybackFinished-PLAYTOOSHORT'
                } else if (dur !== undefined) {
                    // since we want to use UserDataSaved for offline *only* a reasonable assumption to make is that
                    // the last played date + track duration = AT LEAST a little before NO
                    // IE offline for 15 minutes -> played 2:00 track -> played ts is either 15 or 13 minutes ago, but not like 2 seconds ago
                    // -- so if we see a diff of only a few (10 for some buffer) seconds its likely either Jellyfin or a Jellyfin client is reporting
                    // last played date ONLINE and from the start of the track instead of the last (when PlaybackFinished actually occurred)
                    const lastPlayedAndDur = playDate.add(dur.as('seconds'), 'seconds');
                   const diffPlayedDuration = dayjs().diff(lastPlayedAndDur, 'seconds');
                    // TODO at least one PlayBackFinished SaveReason from symphonium is returning local time but with Z (UTC) timezone
                    // which makes this filtering not work at all
                   if(diffPlayedDuration < 10) {
                       eventReason = 'PlaybackFinished-PLAYTOORECENT';
                   }
                }
            }
        }

        return {
            data: {
                artists,
                album: Album,
                track: Name,
                duration: dur !== undefined ? dur.as('seconds') : undefined,
                playDate,
                meta: {
                    brainz: {
                        artist: Provider_musicbrainzartist,
                        album: Provider_musicbrainzalbum,
                        albumArtist: Provider_musicbrainzalbumartist,
                        track: Provider_musicbrainztrack,
                        releaseGroup: Provider_musicbrainzreleasegroup
                    }
                }
            },
            meta: {
                event: NotificationType,
                eventReason,
                mediaType: ItemType,
                trackId: ItemId,
                user: NotificationUsername ?? UserId,
                server,
                source: 'Jellyfin',
                newFromSource: nfs,
                trackProgressPosition: PlaybackPosition !== undefined ? parseDurationFromTimestamp(PlaybackPosition).asSeconds() : undefined,
                sourceVersion: ServerVersion,
                deviceId: combinePartsToString([shortDeviceId(DeviceId), DeviceName])
            }
        }
    }

    protected logFilterFailure = (str: string, meta?: any) => {
        const {
            data: {
                options: {
                    logFilterFailure = 'warn'
                } = {}
            } = {}
        } = this.config;

        if(logFilterFailure === false || !['warn','debug'].includes(logFilterFailure)) {
            return false;
        }

        this.logger[logFilterFailure](str, meta);
    }

    isValidEvent = (playObj: PlayObject) => {
        const {
            meta: {
                mediaType, event, user, server, eventReason
            },
            data: {
                artists,
                track,
            } = {}
        } = playObj;

        if (event !== undefined && !['PlaybackProgress','PlaybackStarted', 'UserDataSaved'].includes(event)) {
            this.logger.debug(`Will not scrobble event because event type is not PlaybackProgress, PlaybackStarted or UserDataSaved - found event: ${event}`)
            return false;
        }

        if (event !== undefined && event === 'UserDataSaved' && eventReason !== 'PlaybackFinished') {
            this.logger.debug(`Will not scrobble event because event type of 'UserDataSaved' did not have a valid SaveReason of 'PlaybackFinished' - found reason: ${eventReason}`)
            return false;
        }


        if (mediaType !== 'Audio') {
            this.logger.debug(`Will not scrobble event because media type was not 'Audio', found type: ${mediaType}`, {
                track
            });
            return false;
        }

        if (this.servers !== undefined && !this.servers.includes(server.toLocaleLowerCase())) {
            this.logFilterFailure(`Will not scrobble event because server was not an allowed server. Expected: ${this.servers.map(x => `'${x}'`).join(' or ')} | Found: '${server.toLocaleLowerCase()}'`, {
                track
            })
            return false;
        }

        if (this.users !== undefined) {
            if (user === undefined) {
                this.logFilterFailure(`Will not scrobble event because config defined users but payload contained no user info`);
                return false;
            } else if (!this.users.includes(user.toLocaleLowerCase())) {
                this.logFilterFailure(`Will not scrobble event because author was not an allowed user. Expected: ${this.users.map(x => `'${x}'`).join(' or ')} | Found: '${user.toLocaleLowerCase()}'`, {
                    artists,
                    track
                })
                return false;
            }
        }

        return true;
    }

    getRecentlyPlayed = async (options = {}) => {
        return this.getFlatRecentlyDiscoveredPlays();
    }

    handle = async (playObj: PlayObject) => {
        if (!this.isValidEvent(playObj)) {
            return;
        }

        const scrobbleOpts = {checkAll: false};
        let newPlays: PlayObject[] = [];
        if(playObj.meta.event === 'UserDataSaved' && playObj.meta.eventReason === 'PlaybackFinished') {
            newPlays = [playObj];
            scrobbleOpts.checkAll = true;
        } else {
            newPlays = this.processRecentPlays([playObj]);
        }

        if(newPlays.length > 0) {
            try {
                this.scrobble(newPlays, scrobbleOpts);
            } catch (e) {
                this.logger.error('Encountered error while scrobbling')
                this.logger.error(e)
            }
        }
    }
}
