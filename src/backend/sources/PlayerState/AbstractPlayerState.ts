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
import { timeToHumanTimestamp, todayAwareFormat } from "../../utils/TimeUtils.js";

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
    currentListenRange?: ListenRange
    listenRanges: ListenRange[] = [];
    createdAt: Dayjs = dayjs();
    stateLastUpdatedAt: Dayjs = dayjs();

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

    get platformIdStr() {
        return genGroupIdStr(this.platformId);
    }

    platformEquals(candidateId: PlayPlatformId) {
        return this.platformId[0] === candidateId[0] && this.platformId[1] === candidateId[1];
    }

    isUpdateStale() {
        if (this.currentPlay !== undefined) {
            return Math.abs(dayjs().diff(this.playLastUpdatedAt, 'seconds')) > this.stateIntervalOptions.staleInterval;
        }
        return false;
    }

    checkStale() {
        const isStale = this.isUpdateStale();
        if (isStale && ![CALCULATED_PLAYER_STATUSES.stale, CALCULATED_PLAYER_STATUSES.orphaned].includes(this.calculatedStatus)) {
            this.calculatedStatus = CALCULATED_PLAYER_STATUSES.stale;
            this.logger.debug(`Stale after no Play updates for ${timeToHumanTimestamp(Math.abs(dayjs().diff(this.playLastUpdatedAt, 'ms')))} (staleAfter ${this.stateIntervalOptions.staleInterval}s)`);
            // end current listening sessions
            this.currentListenSessionEnd();
        }
        return isStale;
    }

    isOrphaned() {
        return dayjs().diff(this.stateLastUpdatedAt, 'seconds') >= this.stateIntervalOptions.orphanedInterval;
    }

    isDead() {
        return dayjs().diff(this.stateLastUpdatedAt, 'seconds') >= this.stateIntervalOptions.orphanedInterval * 2;
    }

    checkOrphaned() {
        const isOrphaned = this.isOrphaned();
        if (isOrphaned && this.calculatedStatus !== CALCULATED_PLAYER_STATUSES.orphaned) {
            this.calculatedStatus = CALCULATED_PLAYER_STATUSES.orphaned;
            this.logger.debug(`Orphaned after no Player updates for ${timeToHumanTimestamp(Math.abs(dayjs().diff(this.stateLastUpdatedAt, 'ms')))} ${Math.abs(dayjs().diff(this.stateLastUpdatedAt, 'minutes'))} (orhanedAfter ${this.stateIntervalOptions.orphanedInterval}s)`);
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
        this.playLastUpdatedAt = dayjs();
        if (status !== undefined) {
            this.reportedStatus = status;
        }
        this.sessionId = sessionId;

        if (this.currentPlay !== undefined) {
            if (!this.incomingPlayMatchesExisting(play)) { // TODO check new play date and listen range to see if they intersect
                this.logger.debug(`Incoming play state (${buildTrackString(play, {include: ['trackId', 'artist', 'track']})}) does not match existing state, removing existing: ${buildTrackString(this.currentPlay, {include: ['trackId', 'artist', 'track']})}`)
                this.currentListenSessionEnd();
                const played = this.getPlayedObject(true);
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
        this.currentPlay = undefined;
        this.playLastUpdatedAt = undefined;
        this.playFirstSeenAt = undefined;
        this.listenRanges = [];
        this.currentListenRange = undefined;
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
                    playDateCompleted: completed ? dayjs() : undefined
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

    protected isSessionRepeat(position?: number, reportedTS?: Dayjs) {
        if(this.currentListenRange === undefined) {
            return false;
        }
        const [isSeeked, seekPos] = this.currentListenRange.seeked(position, reportedTS);
        if (isSeeked === false || seekPos > 0) {
            return false;
        }
        let repeatHint = `New Position (${position})`;
        const trackDur = this.currentPlay.data.duration;
        // user is within 10 seconds or 10% of start of track
        const closeStartNum = position <= 12;
        if(closeStartNum) {
            repeatHint = `${repeatHint} is within 12 seconds of track start`;
        }
        const closeStartPer = (trackDur !== undefined && ((position / trackDur) <= 0.15));
        if(!closeStartNum && closeStartPer) {
            repeatHint = `${repeatHint} is within 15% of track start (${formatNumber((position/trackDur)*100)}%).`;
        }
        if (closeStartNum || closeStartPer) {
            // user has played at least 2 minutes or 50% of track
            const playerDur = this.getListenDuration();
            const closeDurNum = playerDur >= 120;
            if(closeDurNum) {
                repeatHint = `${repeatHint} and listened to more than 120s (${playerDur}s)`
            }
            const closeDurPer = (trackDur !== undefined && (playerDur / trackDur) >= 0.5);
            if(!closeDurNum && closeDurPer) {
                repeatHint = `${repeatHint} and listened to more than 50% (${formatNumber((playerDur/trackDur)*100)}%).`
            }
            if (closeDurNum || closeDurPer) {
                this.logger.verbose(repeatHint);
                return true;
            }
            if (trackDur !== undefined && this.currentListenRange.getPosition() !== undefined) {
                const lastPos = this.currentListenRange.getPosition();
                // or last position is within 10 seconds (or 10%) of end of track
                const nearEndNum = (trackDur - lastPos < 12);
                if(nearEndNum) {
                    repeatHint = `${repeatHint} and previous position was within 12 seconds of track end.`;
                }
                const nearEndPos = ((lastPos / trackDur) > 0.85);
                if(!nearEndNum && nearEndPos) {
                    repeatHint = `${repeatHint} and previous position was within 15% of track end (${formatNumber((lastPos/trackDur)*100)}%)`;
                }
                if(nearEndNum || nearEndPos) {
                    this.logger.verbose(repeatHint);
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
        this.playFirstSeenAt = dayjs();
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
        if (this.currentListenRange !== undefined && this.currentListenRange instanceof ListenRangePositional && this.currentPlay.data.duration !== undefined) {
            progress = `${progressBar(this.currentListenRange.end.position / this.currentPlay.data.duration, 1, 15)} ${formatNumber(this.currentListenRange.end.position, {toFixed: 0})}/${formatNumber(this.currentPlay.data.duration, {toFixed: 0})}s | `;
        }
        let listenedPercent = '';
        if (this.currentPlay !== undefined && this.currentPlay.data.duration !== undefined) {
            listenedPercent = formatNumber((this.getListenDuration() / this.currentPlay.data.duration) * 100, {
                suffix: '%',
                toFixed: 0
            })
        }
        parts.push(`${progress}Listened For: ${formatNumber(this.getListenDuration(), {toFixed: 0})}s ${listenedPercent}`);
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
