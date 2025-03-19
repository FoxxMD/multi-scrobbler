import { Logger } from "@foxxmd/logging";
import dayjs from "dayjs";
import EventEmitter from "events";
import { PlayObject, TA_CLOSE } from "../../core/Atomic.js";
import {
    buildTrackString,
    combinePartsToString,
    splitByFirstFound,
    truncateStringToLength
} from "../../core/StringUtils.js";
import { FormatPlayObjectOptions, InternalConfig, PlayPlatformId } from "../common/infrastructure/Atomic.js";
import { JellySourceConfig } from "../common/infrastructure/config/source/jellyfin.js";
import {
    doubleReturnNewline,
    isDebugMode,
    parseBool,
    playObjDataMatch,
} from "../utils.js";
import { parseDurationFromTimestamp } from '../utils/TimeUtils.js';
import {
    comparePlayTemporally,
    temporalAccuracyIsAtLeast,
    temporalPlayComparisonSummary,
} from "../utils/TimeUtils.js";
import MemorySource from "./MemorySource.js";
import { PlayerStateOptions } from "./PlayerState/AbstractPlayerState.js";
import { JellyfinPlayerState } from "./PlayerState/JellyfinPlayerState.js";

const shortDeviceId = truncateStringToLength(10, '');

const TZ_OFFSET_PRESENT_THRESHOLD = 12;

export default class JellyfinSource extends MemorySource {
    users;
    servers;

    multiPlatform: boolean = true;

    declare config: JellySourceConfig;
    userDataWarn: boolean = false;

    constructor(name: any, config: JellySourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('jellyfin', name, config, internal, emitter);
        const {
            data: {
                users,
                servers,
            } = {},
            options: {
                logFilterFailure = (isDebugMode() ? 'debug' : 'warn')
            } = {}
        } = this.config;

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

        this.logger.warn('Jellyfin source using Webhook plugin is DEPRECATED and will be removed in an upcoming release! Please switch to Jellyfin source using API integration as soon as possible.')
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
        // JELLYFIN WEB -> LastPlayedDate = time when track stopped being played
        if(NotificationType === 'UserDataSaved' && SaveReason === 'PlaybackFinished' && LastPlayedDate !== undefined) {
            nfs = false;

            playDate = dayjs(LastPlayedDate);
            if(Played !== true) {
                eventReason = 'PlaybackFinished-NOTPLAYED'
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
                        artist: splitByFirstFound<undefined>(Provider_musicbrainzartist, [';'], undefined),
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
            options: {
                logFilterFailure = (isDebugMode() ? 'debug' : 'warn')
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

        if (mediaType !== 'Audio') {
            this.logger.debug(`Will not scrobble event because media type was not 'Audio', found type: ${mediaType}`, {
                track
            });
            return false;
        }

        if (event !== undefined && !['PlaybackProgress','PlaybackStarted', 'UserDataSaved'].includes(event)) {
            this.logger.debug(`Will not scrobble event because event type is not PlaybackProgress, PlaybackStarted or UserDataSaved - found event: ${event}`)
            return false;
        }

        if (event !== undefined && event === 'UserDataSaved' && eventReason !== 'PlaybackFinished') {
            this.logger.debug(`Will not scrobble event because event type of 'UserDataSaved' did not have a valid SaveReason of 'PlaybackFinished' - found reason: ${eventReason}`)
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

    getRecentlyPlayed = async (options = {}) => this.getFlatRecentlyDiscoveredPlays()

    handle = async (playObj: PlayObject) => {
        if (!this.isValidEvent(playObj)) {
            return;
        }

        const scrobbleOpts = {checkAll: false};
        let newPlays: PlayObject[] = [];

        //https://github.com/FoxxMD/multi-scrobbler/issues/87
        if(playObj.meta.event === 'UserDataSaved' && playObj.meta.eventReason === 'PlaybackFinished') {

            if(this.userDataWarn === false) {
                this.logger.warn('!!!!!!!!!!WARNING!!!!!!!!!!');
                this.logger.warn(`You have enabled 'UserDataSaved' notification type for the Jellyfin webhook plugin.`);
                this.logger.warn(`This notification's behavior is EXTREMELY bugged and you are likely to see duplicate scrobbles, missed scrobbles, and scrobbles with the wrong timestamp.`);
                this.logger.warn(`This is caused by Jellyfin/plugin behavior that CANNOT be fixed by multi-scrobbler. See here for more context: https://github.com/FoxxMD/multi-scrobbler/issues/87`);
                this.logger.warn(`You WILL NOT receive any support for issues/behavior caused by using the 'UserDataSaved' notification type. USE AT YOUR OWN RISK.`);
                this.logger.warn('!!!!!!!!!!WARNING!!!!!!!!!!');
                this.userDataWarn = true;
            }

            const trackId = buildTrackString(playObj, {include: ['artist', 'track']});

            // sometimes jellyfin sends UserDataSaved payload with a LastPlayedDate that uses local time but accidentally includes a UTC offset (Z)
            const now = dayjs();

            const tz = dayjs.tz.guess();
            // so convert to UTC (corrects hour offset)
            // and then convert BACK to local but keep corrected time
            // then parse as new date from ISO string so dayjs has no knowledge of tz conversion
            const normalizedDate = dayjs(playObj.data.playDate.utc().tz('Etc/UTC').tz(tz, true).toISOString());
            const oneHour = now.add(1, 'hour');

            // if timestamp was from the future (tz offset is positive) we know the new one is correct
            if(playObj.data.playDate.isSameOrAfter(oneHour)) {
                playObj.data.playDate = normalizedDate;
                this.logger.warn(`Play with event UserDataSaved-PlaybackFinished has a playDate that is from the future (${playObj.data.playDate.diff(now, 'minutes')} minutes from now). This is likely a local time with incorrect UTC offset and has been corrected. => ${trackId}`);
            }
            // if the timestamp is super close to the current time its likely the jellyfin client is online and this is the current track that just finished (not offline)
            else if(Math.abs(now.diff(normalizedDate, 'seconds')) < TZ_OFFSET_PRESENT_THRESHOLD) {
                playObj.data.playDate = normalizedDate;
                this.logger.warn(`Play with event UserDataSaved-PlaybackFinished has a playDate that when timezone offset adjusted is only ${Math.abs(now.diff(normalizedDate, 'seconds'))}s from now. This is likely a local time with incorrect UTC offset and has been corrected. => ${trackId}`);
            }
            // unfortunately there's nothing(?) that can be done accurately detect and correct real offline play dates when the timezone offset is negative (in the past)

            let existingTracked: PlayObject;
            for(const [platformIdStr, player] of this.players) {
                const currPlay = player.getPlayedObject();
                if(currPlay !== undefined && playObjDataMatch(currPlay, playObj)) {
                    const temporalResult = comparePlayTemporally(currPlay, playObj);
                    if(isDebugMode()) {
                        player.logger.debug(doubleReturnNewline`
                        Play with event UserDataSaved-PlaybackFinished matched => ${trackId}
                        
                        Temporal Comparison => ${temporalPlayComparisonSummary(temporalResult, currPlay, playObj)}`);
                    }
                    if(temporalAccuracyIsAtLeast(TA_CLOSE,temporalResult.match)) {
                        existingTracked = currPlay;
                    }
                    break;
                }
            }
            if(existingTracked !== undefined) {
                this.logger.debug(`Will not scrobble Play with event UserDataSaved-PlaybackFinished because it has already been tracked => ${trackId}`);
                return;
            }

            // if last played ts was less than 30 seconds ago it's too early to scrobble (skipped track, essentially)
            const finishedToNow = now.diff(playObj.data.playDate, 'seconds');
            if(Math.abs(finishedToNow) < 30) {
                this.logger.debug(`Will not scrobble Play with event UserDataSaved-PlaybackFinished because it took place too recently (${finishedToNow}s) => ${trackId}`);
                return;
            }

            if(playObj.data.duration !== undefined) {
                // since we want to use UserDataSaved for offline *only* a reasonable assumption to make is that
                // the last played date + track duration = AT LEAST a little before NOW
                // IE offline for 15 minutes -> played 2:00 track -> played ts is either 15 or 13 minutes ago, but not like 2 seconds ago
                // -- so if we see a diff of only a few (10 for some buffer) seconds it's likely either Jellyfin or a Jellyfin client is reporting
                // last played date while ONLINE and from the start of the track instead of the last (when PlaybackFinished actually occurred)
                const lastPlayedAndDur = playObj.data.playDate.add(playObj.data.duration, 'seconds');
                const diffPlayedDuration = now.diff(lastPlayedAndDur, 'seconds');
                // TODO at least one PlayBackFinished SaveReason from symphonium is returning local time but with Z (UTC) timezone
                // which makes this filtering not work at all
                if(diffPlayedDuration < 10) {
                    this.logger.debug(`Will not scrobble Play with event UserDataSaved-PlaybackFinished because it is likely from online client (play date + track duration = ~now) => ${trackId}`);
                    return;
                }
            }


            // good confidence this play object is from an offline event in which case we want to immediately scrobble it
            // or we have already discovered this play (so it won't be re-scrobbled)
            newPlays = [playObj];
            scrobbleOpts.checkAll = true;

        } else {
            newPlays = this.processRecentPlays([playObj]);
        }

        if(newPlays.length > 0) {
            try {
                const discovered = this.discover(newPlays, scrobbleOpts);
                this.scrobble(discovered);
            } catch (e) {
                this.logger.error('Encountered error while scrobbling')
                this.logger.error(e)
            }
        }
    }

    getNewPlayer = (logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions) => new JellyfinPlayerState(logger, id, opts)
}
