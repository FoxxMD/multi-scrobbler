import { childLogger, Logger } from "@foxxmd/logging";
import dayjs, { Dayjs } from "dayjs";
import { PlayObject, PlayProgress, Second, SOURCE_SOT, SOURCE_SOT_TYPES, SourcePlayerObj } from "../../../core/Atomic.js";
import { buildTrackString } from "../../../core/StringUtils.js";
import {
    asPlayerStateData,
    CALCULATED_PLAYER_STATUSES,
    CalculatedPlayerStatus,
    PlayerStateData,
    PlayerStateDataMaybePlay,
    PlayPlatformId,
    REPORTED_PLAYER_STATUSES,
    ReportedPlayerStatus,
} from "../../common/infrastructure/Atomic.js";
import { PollingOptions } from "../../common/infrastructure/config/common.js";
import { formatNumber, genGroupIdStr, playObjDataMatch, progressBar } from "../../utils.js";
import { ListenProgress } from "./ListenProgress.js";
import { ListenRange, ListenRangePositional } from "./ListenRange.js";
import { closeToPlayEnd, closeToPlayStart, repeatDurationPlayed, timeToHumanTimestamp, todayAwareFormat } from "../../utils/TimeUtils.js";

export interface PlayerStateIntervals {
    staleInterval?: number
    orphanedInterval?: number
}

export interface PlayerStateOptions extends PlayerStateIntervals {
    allowedDrift?: number
    rtTruth?: boolean
}

export const DefaultPlayerStateOptions: PlayerStateOptions = {};

export const createPlayerOptions = (pollingOpts?: Partial<PollingOptions>, sot: SOURCE_SOT_TYPES = SOURCE_SOT.PLAYER, logger?: Logger): PlayerStateOptions => {
    const {
        interval = 30,
        maxInterval = 60,
        staleAfter,
        orphanedAfter
    } = pollingOpts || {};

    let sa = staleAfter,
    oa = orphanedAfter;

    // if this player is not the source of truth we don't care about waiting around to see if the state comes back
    // in fact, we probably want to get rid of it as fast as possible since its superficial and more of an ephemeral "Now Playing" status than something we are actually tracking
    const staleAfterDefault = sot === SOURCE_SOT.PLAYER ? interval * 3 : interval;
    const orphanedAfterDefault = sot === SOURCE_SOT.PLAYER ? interval * 5 : maxInterval;

    if(sa === undefined) {
        sa = staleAfterDefault;
    }
    if(oa === undefined) {
        oa = orphanedAfterDefault;
    }
    if(oa < sa) {
        oa = sa;
        if(logger !== undefined) {
            logger.warn(`'orhanedAfter' (${oa}s) was less than 'staleAfter' (${sa}s) which is not allowed! 'orhanedAfter' has been set to equal 'staleAfter'`);
        }
    }

    return {
        staleInterval: sa,
        orphanedInterval: oa
    }
}

export abstract class AbstractPlayerState {
    logger: Logger;
    reportedStatus: ReportedPlayerStatus = REPORTED_PLAYER_STATUSES.unknown
    calculatedStatus: CalculatedPlayerStatus = CALCULATED_PLAYER_STATUSES.unknown
    platformId: PlayPlatformId
    sessionId?: string
    stateIntervalOptions: Required<PlayerStateIntervals>;
    currentPlay?: PlayObject
    playFirstSeenAt?: Dayjs
    playLastUpdatedAt?: Dayjs
    isRepeatPlay?: boolean = false;
    currentListenRange?: ListenRange
    listenRanges: ListenRange[] = [];
    createdAt: Dayjs = dayjs();
    stateLastUpdatedAt: Dayjs = dayjs();

    lastPlay?: PlayObject
    lastPlayUpdatedAt?: Dayjs

    protected constructor(logger: Logger, platformId: PlayPlatformId, opts: PlayerStateOptions = DefaultPlayerStateOptions) {
        this.platformId = platformId;
        this.logger = childLogger(logger, `Player ${this.platformIdStr}`);

        const {
            staleInterval = 120,
            orphanedInterval = 300,
        } = opts;
        this.stateIntervalOptions = {staleInterval, orphanedInterval: orphanedInterval};
    }

    protected abstract newListenProgress(data?: Partial<PlayProgress>): ListenProgress;
    protected abstract newListenRange(start?: ListenProgress, end?: ListenProgress, options?: object): ListenRange;

    protected getStaleInterval(): number {
        return this.stateIntervalOptions.staleInterval;
    }

    protected getOrphanedInterval(): number {
        return this.stateIntervalOptions.orphanedInterval;
    }

    get platformIdStr() {
        return genGroupIdStr(this.platformId);
    }

    platformEquals(candidateId: PlayPlatformId) {
        return this.platformId[0] === candidateId[0] && this.platformId[1] === candidateId[1];
    }

    isUpdateStale(reportedTS?: Dayjs) {
        if (this.currentPlay !== undefined) {
            return Math.abs((reportedTS ?? dayjs()).diff(this.playLastUpdatedAt, 'seconds')) > this.getStaleInterval();
        }
        return false;
    }

    checkStale(reportedTS?: Dayjs) {
        const isStale = this.isUpdateStale(reportedTS);
        if (isStale && ![CALCULATED_PLAYER_STATUSES.stale, CALCULATED_PLAYER_STATUSES.orphaned].includes(this.calculatedStatus)) {
            this.calculatedStatus = CALCULATED_PLAYER_STATUSES.stale;
            this.logger.debug(`Stale after no Play updates for ${timeToHumanTimestamp(Math.abs((reportedTS ?? dayjs()).diff(this.playLastUpdatedAt, 'ms')))} (staleAfter ${this.getStaleInterval()}s)`);
            // end current listening sessions
            this.currentListenSessionEnd();
        }
        return isStale;
    }

    isOrphaned() {
        return dayjs().diff(this.stateLastUpdatedAt, 'seconds') >= this.getOrphanedInterval();
    }

    isDead() {
        return dayjs().diff(this.stateLastUpdatedAt, 'seconds') >= this.getOrphanedInterval()* 2;
    }

    checkOrphaned() {
        const isOrphaned = this.isOrphaned();
        if (isOrphaned && this.calculatedStatus !== CALCULATED_PLAYER_STATUSES.orphaned) {
            this.calculatedStatus = CALCULATED_PLAYER_STATUSES.orphaned;
            this.logger.debug(`Orphaned after no Player updates for ${timeToHumanTimestamp(Math.abs(dayjs().diff(this.stateLastUpdatedAt, 'ms')))} ${Math.abs(dayjs().diff(this.stateLastUpdatedAt, 'minutes'))} (orhanedAfter ${this.getOrphanedInterval()}s)`);
        }
        return isOrphaned;
    }

    isProgressing() {
        return AbstractPlayerState.isProgressStatus(this.reportedStatus);
    }

    static isProgressStatus(status: ReportedPlayerStatus) {
        return status !== 'paused' && status !== 'stopped';
    }

    update(state: PlayerStateDataMaybePlay, reportedTS?: Dayjs) {
        this.stateLastUpdatedAt = dayjs();

        const {play, status} = state;

        if (asPlayerStateData(state)) {
            return this.setPlay(state, reportedTS);
        } 

        if (status !== undefined) {
            if (status === 'stopped' && this.reportedStatus !== 'stopped' && this.currentPlay !== undefined) {
                this.stopPlayer();
                const play = this.getPlayedObject(true);
                this.clearPlayer();
                return [play, play];
            }
            this.reportedStatus = status;
        } else if (this.reportedStatus === undefined) {
            this.reportedStatus = REPORTED_PLAYER_STATUSES.unknown;
        }
        return [];
    }

    protected setPlay(state: PlayerStateData, reportedTS?: Dayjs): [PlayObject, PlayObject?] {
        const {play, status, sessionId} = state;
        this.playLastUpdatedAt = reportedTS ?? dayjs();
        if (status !== undefined) {
            this.reportedStatus = status;
        }
        this.sessionId = sessionId;

        if (this.currentPlay !== undefined) {
            if (!this.incomingPlayMatchesExisting(play)) { // TODO check new play date and listen range to see if they intersect
                this.logger.debug(`Incoming play state (${buildTrackString(play, {include: ['trackId', 'artist', 'track']})}) does not match existing state, removing existing: ${buildTrackString(this.currentPlay, {include: ['trackId', 'artist', 'track']})}`)
                this.currentListenSessionEnd();
                const played = this.getPlayedObject(true);
                this.isRepeatPlay = false;
                this.lastPlay = played;
                this.lastPlayUpdatedAt = dayjs();
                this.setCurrentPlay(state, {reportedTS});
                if (this.calculatedStatus !== CALCULATED_PLAYER_STATUSES.playing) {
                    this.calculatedStatus = CALCULATED_PLAYER_STATUSES.unknown;
                }
                return [this.getPlayedObject(), played];
            } else if (status !== undefined && !AbstractPlayerState.isProgressStatus(status)) {
                this.currentListenSessionEnd();
                this.calculatedStatus = this.reportedStatus;
            } else if (this.isSessionRepeat(state.position, reportedTS)) {
                // if we detect the track has been restarted end listen session and treat as a new play
                this.currentListenSessionEnd();
                const played = this.getPlayedObject(true);
                play.data.playDate = dayjs();
                this.isRepeatPlay = true;
                this.logger.debug('New Play is a repeat');
                this.setCurrentPlay(state, {reportedTS});
                return [this.getPlayedObject(), played];
            } else {
                if(this.currentListenRange !== undefined) {
                    const [isSeeked, seekedPos] = this.currentListenRange.seeked(state.position, reportedTS);
                    if (isSeeked !== false) {
                        this.logger.verbose(`Detected player was seeked ${(seekedPos / 1000).toFixed(2)}s, starting new listen range`);
                        if(state.position !== undefined && (this.currentListenRange as ListenRangePositional).end.position === state.position) {
                            this.calculatedStatus = CALCULATED_PLAYER_STATUSES.paused;
                        }
                        // if player has been seeked start a new listen range so our numbers don't get all screwy
                        this.currentListenSessionEnd();
                    }
                }

                this.currentListenSessionContinue(state.position, reportedTS);
            }
        } else {
            this.isRepeatPlay = false;
            // compensate for Players that report as STOPPED between Plays
            // -- should we check for closeToPlayStart() as well?
            if(this.lastPlay !== undefined) {
                const lastPlayDiff = Math.abs(this.lastPlayUpdatedAt.diff(dayjs(), 's'));
                const shortDiff = lastPlayDiff < 20;
                const lastPlayMatch = playObjDataMatch(play, this.lastPlay);
                this.isRepeatPlay = shortDiff && lastPlayMatch;
                this.logger.debug(`Last Play ${shortDiff ? 'was' : 'was not'} within 20s of new Player session and ${lastPlayMatch ? 'does' : 'does not'} match new Play -- ${this.isRepeatPlay ? 'is' : 'is not'} a repeat Play`);
            }
            
            this.setCurrentPlay(state);
            this.calculatedStatus = CALCULATED_PLAYER_STATUSES.unknown;
        }

        if (this.reportedStatus === undefined) {
            this.reportedStatus = REPORTED_PLAYER_STATUSES.unknown;
        }

        return [this.getPlayedObject(), undefined];
    }

    protected incomingPlayMatchesExisting(play: PlayObject): boolean { return playObjDataMatch(this.currentPlay, play); }

    protected clearPlayer() {
        this.lastPlay = this.currentPlay;
        this.lastPlayUpdatedAt = dayjs();
        this.currentPlay = undefined;
        this.playLastUpdatedAt = undefined;
        this.playFirstSeenAt = undefined;
        this.listenRanges = [];
        this.currentListenRange = undefined;
        this.isRepeatPlay = false;
    }

    protected stopPlayer() {
        this.reportedStatus = 'stopped';
        this.calculatedStatus = 'stopped';
        this.playLastUpdatedAt = dayjs();
        this.currentListenSessionEnd();
    }

    public getPlayedObject(completed: boolean = false): PlayObject | undefined {
        if(this.currentPlay !== undefined) {
            const ranges = [...this.listenRanges];
            if (this.currentListenRange !== undefined) {
                ranges.push(this.currentListenRange);
            }
            if(completed) {
                this.logger.debug('Generating play object with playDateCompleted');
            }
            return {
                data: {
                    ...this.currentPlay.data,
                    playDate: this.playFirstSeenAt,
                    listenedFor: this.getListenDuration(),
                    listenRanges: ranges,
                    playDateCompleted: completed ? dayjs() : undefined,
                    repeat: this.isRepeatPlay
                },
                meta: this.currentPlay.meta
            }
        }
        return undefined;
    }

    public getListenDuration(): Second{
        let listenDur: number = 0;
        const ranges = [...this.listenRanges];
        if (this.currentListenRange !== undefined) {
            ranges.push(this.currentListenRange);
        }
        for (const range of ranges) {
            listenDur += range.getDuration();
        }
        return listenDur;
    }

    protected abstract currentListenSessionContinue(position?: number | undefined, timestamp?: Dayjs);

    protected abstract currentListenSessionEnd();

    /** Check if new Player Position was seeked to a Position that indicates user is repeating the track
     * 
     * True if:
     *   * New position is close to start of Play and...
     *     * Listened duraton is more than 2 minutes/50% of Play OR...
     *     * Previous Position was close to end of Play
     */
    protected isSessionRepeat(position?: number, reportedTS?: Dayjs): boolean {
        if(this.currentListenRange === undefined) {
            return false;
        }
        const [isSeeked, seekPos] = this.currentListenRange.seeked(position, reportedTS);
        if (isSeeked === false || seekPos > 0) {
            return false;
        }

        const hints: string[] = [];

        let repeatHint = `New Position (${position})`;
        const trackDur = this.currentPlay.data.duration;

        // new position is close to start of Play
        const [closeStart, closeStartHint] = closeToPlayStart(this.currentPlay, position, {hintPrefix: false});
        hints.push(closeStartHint);

        if (closeStart) {
            const playerDur = this.getListenDuration();
            const [repeatDurationOk, repeatDurationHint] = repeatDurationPlayed(this.currentPlay, playerDur, {hintPrefix: false});

            // user has played at least 2 minutes or 50% of track
            if (repeatDurationOk) {
                this.logger.verbose(`${repeatHint} ${[closeStartHint, repeatDurationHint].join(' and ')}`);
                return true;
            }

            const lastPos = this.currentListenRange.getPosition();
            if (trackDur !== undefined && lastPos !== undefined) {
                const [nearEnd, nearEndHint] = closeToPlayEnd(this.currentPlay, lastPos, {hintPrefix: false});
                // last position is close to end of Play
                if(nearEnd) {
                    this.logger.verbose(`${repeatHint} ${[closeStartHint, nearEndHint].join(' and ')}`);
                    return true;
                }
            }
        }
        return false;
    }

    protected setCurrentPlay(state: PlayerStateData, options?: CurrentPlayOptions) {

        const {
            status,
            reportedTS,
            listenSessionManaged = true
        } = options || {};

        const {play, position} = state;

        this.currentPlay = play;
        this.playFirstSeenAt = reportedTS ?? dayjs();
        this.listenRanges = [];
        this.currentListenRange = undefined;

        this.logger.verbose(`New Play: ${buildTrackString(play, {include: ['trackId', 'artist', 'track', 'session']})}`);

        if (status !== undefined) {
            this.reportedStatus = status;
        }

        if (listenSessionManaged && !['stopped'].includes(this.reportedStatus)) {
            this.currentListenSessionContinue(position, reportedTS);
        }
    }

    public textSummary() {
        const parts = [''];
        let play: string;
        if (this.currentPlay !== undefined) {
            parts.push(`${buildTrackString(this.currentPlay, {include: ['trackId', 'artist', 'track', 'session']})} @ ${todayAwareFormat(this.playFirstSeenAt)}`);
        }
        parts.push(`Reported: ${this.reportedStatus.toUpperCase()} | Calculated: ${this.calculatedStatus.toUpperCase()} | Stale: ${this.isUpdateStale() ? 'Yes' : 'No'} | Orphaned: ${this.isOrphaned() ? 'Yes' : 'No'} | Player Updated At: ${todayAwareFormat(this.stateLastUpdatedAt)} | Play Updated At: ${this.playLastUpdatedAt === undefined ? 'N/A' : todayAwareFormat(this.playLastUpdatedAt)}`);
        let progress = '';
        if (this.currentListenRange !== undefined && this.currentListenRange instanceof ListenRangePositional && this.currentPlay.data.duration !== undefined && this.currentPlay.data.duration !== 0) {
            progress = `${progressBar(this.currentListenRange.end.position / this.currentPlay.data.duration, 1, 15)} ${formatNumber(this.currentListenRange.end.position, {toFixed: 0})}/${formatNumber(this.currentPlay.data.duration, {toFixed: 0})}s Reported | `;
        }
        let listenedPercent = '';
        if (this.currentPlay !== undefined && this.currentPlay.data.duration !== undefined && this.currentPlay.data.duration !== 0) {
            listenedPercent = formatNumber((this.getListenDuration() / this.currentPlay.data.duration) * 100, {
                suffix: '%',
                toFixed: 0
            })
        }
        parts.push(`${progress}Listened For: ${formatNumber(this.getListenDuration(), {toFixed: 0})}s ${listenedPercent}`);
        if (this.currentListenRange !== undefined && this.currentListenRange instanceof ListenRangePositional && this.currentListenRange.rtTruth) {
            const rtProgress = `${progressBar((this.currentListenRange.rtPlayer.getPosition() / 1000) / this.currentPlay.data.duration, 1, 15)} ${formatNumber(this.currentListenRange.rtPlayer.getPosition() / 1000, {toFixed: 0})}/${formatNumber(this.currentPlay.data.duration, {toFixed: 0})}s`;
            parts.push(`${rtProgress} Realtime | Drifted ${formatNumber(Math.abs(this.currentListenRange.getDrift() / 1000), {toFixed: 1})}s (Max ${formatNumber(this.currentListenRange.getAllowedDrift() / 1000, {toFixed: 1})})`);
        }
        return parts.join('\n');
    }

    public logSummary() {
        this.logger.debug(this.textSummary());
    }

    public getPosition(): Second | undefined {
        if(this.calculatedStatus === 'stopped') {
            return undefined;
        }
        if(this.currentListenRange !== undefined) {
            return this.currentListenRange.getPosition();
        }
        if(this.listenRanges.length > 0) {
            return this.listenRanges[this.listenRanges.length - 1].getPosition();
        }
        return undefined;
    }

    public getApiState(): SourcePlayerObj {
        return {
            platformId: this.platformIdStr,
            play: this.getPlayedObject(),
            playLastUpdatedAt: this.playLastUpdatedAt !== undefined ? this.playLastUpdatedAt.toISOString() : undefined,
            playFirstSeenAt: this.playFirstSeenAt !== undefined ? this.playFirstSeenAt.toISOString() : undefined,
            playerLastUpdatedAt: this.stateLastUpdatedAt.toISOString(),
            createdAt: dayjs().unix(),
            position: this.getPosition(),
            listenedDuration: this.getListenDuration(),
            status: {
                reported: this.reportedStatus,
                calculated: this.calculatedStatus,
                stale: this.isUpdateStale(),
                orphaned: this.isOrphaned()
            }
        }
    }

    public transferToNewPlayer(newPlayer: AbstractPlayerState) {
        this.logger.debug(`Transferring state to new Player (${newPlayer.platformIdStr})`);
        newPlayer.calculatedStatus = this.calculatedStatus;
        if(this.currentPlay !== undefined) {
            newPlayer.setCurrentPlay({play: this.currentPlay, platformId: this.platformId}, {status: this.reportedStatus, listenSessionManaged: false});
        }
        newPlayer.currentListenRange = this.currentListenRange;
        newPlayer.listenRanges = this.listenRanges;
        newPlayer.playFirstSeenAt = this.playFirstSeenAt;
        newPlayer.playLastUpdatedAt = this.playLastUpdatedAt;
    }
}

export interface CurrentPlayOptions {
    status?: ReportedPlayerStatus,
    reportedTS?: Dayjs
    listenSessionManaged?: boolean
}
