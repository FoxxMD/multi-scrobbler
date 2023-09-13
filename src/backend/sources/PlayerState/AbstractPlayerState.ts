import {
    CALCULATED_PLAYER_STATUSES,
    CalculatedPlayerStatus,
    PlayPlatformId,
    REPORTED_PLAYER_STATUSES,
    ReportedPlayerStatus,
} from "../../common/infrastructure/Atomic";
import dayjs, {Dayjs} from "dayjs";
import { formatNumber, genGroupIdStr, playObjDataMatch, progressBar } from "../../utils";
import {Logger} from "@foxxmd/winston";
import { ListenProgress } from "./ListenProgress";
import {ListenRange, PlayData, PlayObject, SourcePlayerObj} from "../../../core/Atomic";
import { buildTrackString } from "../../../core/StringUtils";

export interface PlayerStateIntervals {
    staleInterval?: number
    orphanedInterval?: number
}

export interface PlayerStateOptions extends PlayerStateIntervals {
}

export abstract class AbstractPlayerState {
    logger: Logger;
    reportedStatus: ReportedPlayerStatus = REPORTED_PLAYER_STATUSES.unknown
    calculatedStatus: CalculatedPlayerStatus = CALCULATED_PLAYER_STATUSES.unknown
    platformId: PlayPlatformId
    stateIntervalOptions: Required<PlayerStateIntervals>;
    currentPlay?: PlayObject
    playFirstSeenAt?: Dayjs
    playLastUpdatedAt?: Dayjs
    currentListenRange?: [ListenProgress, ListenProgress]
    listenRanges: [ListenProgress, ListenProgress][] = [];
    createdAt: Dayjs = dayjs();
    stateLastUpdatedAt: Dayjs = dayjs();

    protected constructor(logger: Logger, platformId: PlayPlatformId, opts?: PlayerStateOptions) {
        this.platformId = platformId;
        this.logger = logger.child({labels: [`Player ${this.platformIdStr}`]});

        const {
            staleInterval = 120,
            orphanedInterval = 300,
        } = opts || {};
        this.stateIntervalOptions = {staleInterval, orphanedInterval: orphanedInterval};
    }

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
            this.logger.debug(`Stale after no Play updates for ${Math.abs(dayjs().diff(this.playLastUpdatedAt, 'seconds'))} seconds`);
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
            this.logger.debug(`Orphaned after no player updates for ${Math.abs(dayjs().diff(this.stateLastUpdatedAt, 'minutes'))} minutes`);
        }
        return isOrphaned;
    }

    isProgressing() {
        return AbstractPlayerState.isProgressStatus(this.reportedStatus);
    }

    static isProgressStatus(status: ReportedPlayerStatus) {
        return status !== 'paused' && status !== 'stopped';
    }

    setState(status?: ReportedPlayerStatus, play?: PlayObject) {
        this.stateLastUpdatedAt = dayjs();
        if (play !== undefined) {
            return this.setPlay(play, status);
        } else if (status !== undefined) {
            if (status === 'stopped' && this.reportedStatus !== 'stopped' && this.currentPlay !== undefined) {
                this.stopPlayer();
                const play = this.getPlayedObject();
                this.clearPlayer();
                return [play, play];
            }
            this.reportedStatus = status;
        } else if (this.reportedStatus === undefined) {
            this.reportedStatus = REPORTED_PLAYER_STATUSES.unknown;
        }
        return [];
    }

    setPlay(play: PlayObject, status?: ReportedPlayerStatus): [PlayObject, PlayObject?] {
        this.playLastUpdatedAt = dayjs();
        if (status !== undefined) {
            this.reportedStatus = status;
        }

        if (this.currentPlay !== undefined) {
            if (!playObjDataMatch(this.currentPlay, play)/* || (true !== false)*/) { // TODO check new play date and listen range to see if they intersect
                this.logger.debug(`Incoming play state (${buildTrackString(play, {include: ['trackId', 'artist', 'track']})}) does not match existing state, removing existing: ${buildTrackString(this.currentPlay, {include: ['trackId', 'artist', 'track']})}`)
                this.currentListenSessionEnd();
                const played = this.getPlayedObject();
                this.setCurrentPlay(play);
                if (this.calculatedStatus !== CALCULATED_PLAYER_STATUSES.playing) {
                    this.calculatedStatus = CALCULATED_PLAYER_STATUSES.unknown;
                }
                return [this.getPlayedObject(), played];
            } else if (status !== undefined && !AbstractPlayerState.isProgressStatus(status)) {
                this.currentListenSessionEnd();
                this.calculatedStatus = this.reportedStatus;
            } else {
                this.currentListenSessionContinue(play.meta.trackProgressPosition);
            }
        } else {
            this.setCurrentPlay(play);
            this.calculatedStatus = CALCULATED_PLAYER_STATUSES.unknown;
        }

        if (this.reportedStatus === undefined) {
            this.reportedStatus = REPORTED_PLAYER_STATUSES.unknown;
        }

        return [this.getPlayedObject(), undefined];
    }

    clearPlayer() {
        this.currentPlay = undefined;
        this.playLastUpdatedAt = undefined;
        this.playFirstSeenAt = undefined;
        this.listenRanges = [];
        this.currentListenRange = undefined;
    }

    stopPlayer() {
        this.reportedStatus = 'stopped';
        this.playLastUpdatedAt = dayjs();
        this.currentListenSessionEnd();
    }

    getPlayedObject(): PlayObject | undefined {
        if(this.currentPlay !== undefined) {
            let ranges = [...this.listenRanges];
            if (this.currentListenRange !== undefined) {
                ranges.push(this.currentListenRange);
            }
            return {
                data: {
                    ...this.currentPlay.data,
                    playDate: this.playFirstSeenAt,
                    listenedFor: this.getListenDuration(),
                    listenRanges: ranges
                },
                meta: this.currentPlay.meta
            }
        }
        return undefined;
    }

    getListenDuration() {
        let listenDur: number = 0;
        let ranges = [...this.listenRanges];
        if (this.currentListenRange !== undefined) {
            ranges.push(this.currentListenRange);
        }
        for (const [start, end] of ranges) {
            listenDur += start.getDuration(end);
        }
        return listenDur;
    }

    currentListenSessionContinue(position?: number) {
        const now = dayjs();
        if (this.currentListenRange === undefined) {
            this.logger.debug('Started new Player listen range.');
            this.currentListenRange = [new ListenProgress(now, position), new ListenProgress(now, position)];
        } else {
            const newEndProgress = new ListenProgress(now, position);
            if (position !== undefined && this.currentListenRange[1].position !== undefined) {
                const oldEndProgress = this.currentListenRange[1];
                if (position === oldEndProgress.position && !['paused', 'stopped'].includes(this.calculatedStatus)) {
                    this.calculatedStatus = this.reportedStatus === 'stopped' ? CALCULATED_PLAYER_STATUSES.stopped : CALCULATED_PLAYER_STATUSES.paused;
                    if (this.reportedStatus !== this.calculatedStatus) {
                        this.logger.verbose(`Reported status '${this.reportedStatus}' but track position has not progressed between two updates. Calculated player status is now ${this.calculatedStatus}`);
                    } else {
                        this.logger.debug(`Player position is equal between current -> last update. Updated calculated status to ${this.calculatedStatus}`);
                    }
                } else if (position !== oldEndProgress.position && this.calculatedStatus !== 'playing') {
                    this.calculatedStatus = CALCULATED_PLAYER_STATUSES.playing;
                    if (this.reportedStatus !== this.calculatedStatus) {
                        this.logger.verbose(`Reported status '${this.reportedStatus}' but track position has progressed between two updates. Calculated player status is now ${this.calculatedStatus}`);
                    } else {
                        this.logger.debug(`Player position changed between current -> last update. Updated calculated status to ${this.calculatedStatus}`);
                    }
                }
            } else {
                this.calculatedStatus = CALCULATED_PLAYER_STATUSES.playing;
            }
            this.currentListenRange = [this.currentListenRange[0], newEndProgress];
        }
    }

    currentListenSessionEnd() {
        if (this.currentListenRange !== undefined && this.currentListenRange[0].getDuration(this.currentListenRange[1]) !== 0) {
            this.logger.debug('Ended current Player listen range.')
            this.listenRanges.push(this.currentListenRange);
        }
        this.currentListenRange = undefined;
    }

    setCurrentPlay(play: PlayObject, status?: ReportedPlayerStatus) {
        this.currentPlay = play;
        this.playFirstSeenAt = dayjs();
        this.listenRanges = [];
        this.currentListenRange = undefined;

        this.logger.debug(`New Play: ${buildTrackString(play, {include: ['trackId', 'artist', 'track']})}`);

        if (status !== undefined) {
            this.reportedStatus = status;
        }

        if (!['stopped'].includes(this.reportedStatus)) {
            this.currentListenSessionContinue(play.meta.trackProgressPosition);
        }
    }

    textSummary() {
        let parts = [''];
        let play: string;
        if (this.currentPlay !== undefined) {
            parts.push(`${buildTrackString(this.currentPlay, {include: ['trackId', 'artist', 'track']})} @ ${this.playFirstSeenAt.toISOString()}`);
        }
        parts.push(`Reported: ${this.reportedStatus.toUpperCase()} | Calculated: ${this.calculatedStatus.toUpperCase()} | Stale: ${this.isUpdateStale() ? 'Yes' : 'No'} | Orphaned: ${this.isOrphaned() ? 'Yes' : 'No'} | Last Update: ${this.stateLastUpdatedAt.toISOString()}`);
        let progress = '';
        if (this.currentListenRange !== undefined && this.currentListenRange[1].position !== undefined && this.currentPlay.data.duration !== undefined) {
            progress = `${progressBar(this.currentListenRange[1].position / this.currentPlay.data.duration, 1, 15)} ${formatNumber(this.currentListenRange[1].position, {toFixed: 0})}/${formatNumber(this.currentPlay.data.duration, {toFixed: 0})}s | `;
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

    logSummary() {
        this.logger.debug(this.textSummary());
    }

    getPosition() {
        if(this.calculatedStatus === 'stopped') {
            return undefined;
        }
        let lastRange: [ListenProgress, ListenProgress] | undefined;
        if(this.currentListenRange !== undefined) {
            lastRange = this.currentListenRange;
        } else if(this.listenRanges.length > 0) {
            lastRange = this.listenRanges[this.listenRanges.length - 1];
        }
        if(lastRange === undefined || lastRange[1] === undefined || lastRange[1].position === undefined) {
            return undefined;
        }
        return lastRange[1].position;
    }

    getApiState(): SourcePlayerObj {
        return {
            platformId: this.platformIdStr,
            play: this.getPlayedObject(),
            playLastUpdatedAt: this.playLastUpdatedAt.toISOString(),
            playFirstSeenAt: this.playFirstSeenAt.toISOString(),
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
}
