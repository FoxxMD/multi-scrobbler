import { Logger } from "@foxxmd/logging";
import { CALCULATED_PLAYER_STATUSES, PlayPlatformId, REPORTED_PLAYER_STATUSES } from "../../common/infrastructure/Atomic.js";
import { AbstractPlayerState, PlayerStateOptions } from "./AbstractPlayerState.js";
import { GenericPlayerState } from "./GenericPlayerState.js";
import { GenericRealtimePlayer, RealtimePlayer } from "./RealtimePlayer.js";
import { PlayProgress, PlayProgressPositional, Second } from "../../../core/Atomic.js";
import { Dayjs } from "dayjs";
import { ListenProgress, ListenProgressPositional } from "./ListenProgress.js";
import { ListenRange, ListenRangePositional } from "./ListenRange.js";

export class PositionalPlayerState extends AbstractPlayerState {

    protected allowedDrift: number;
    protected rtTruth: boolean;
    protected gracefulEndBuffer: number = 3;

    declare currentListenRange?: ListenRangePositional;
    declare listenRanges: ListenRangePositional[];

    constructor(logger: Logger, platformId: PlayPlatformId, opts?: PlayerStateOptions) {
        super(logger, platformId, opts);
        const {
            allowedDrift = 3000,
            rtTruth = false,
        } = opts || {};
        this.allowedDrift = allowedDrift;
        this.rtTruth = rtTruth;
    }

    protected newListenProgress(data?: PlayProgressPositional): ListenProgressPositional {
       return new ListenProgressPositional(data);
    }
    protected newListenRange(start?: ListenProgressPositional, end?: ListenProgressPositional, options: object = {}): ListenRangePositional {
       return new ListenRangePositional(start, end, {allowedDrift: this.allowedDrift, rtTruth: this.rtTruth, ...options});
    }

    protected isSessionStillPlaying(position: number): boolean {
        //return this.reportedStatus === REPORTED_PLAYER_STATUSES.playing;
        if(!this.currentListenRange.isOverDrifted(position)) {
            return true;
        }
        return position !== this.currentListenRange.end.position;
    }

    protected currentListenSessionContinue(position: number = 0, timestamp?: Dayjs) {
        if (this.currentListenRange === undefined) {
            this.logger.debug('Started new Player listen range.');
            let usedPosition = position;
            if (this.calculatedStatus === CALCULATED_PLAYER_STATUSES.playing && position !== undefined && position <= 3) {
                // likely the player has moved to a new track from a previous track (still calculated as playing)
                // and polling/network delays means we did not catch absolute beginning of track
                usedPosition = 1;
            }
            this.currentListenRange = this.newListenRange(this.newListenProgress({ timestamp, position: usedPosition }), undefined);
        } else {
            const oldEndProgress = this.currentListenRange.end;
            const newEndProgress = this.newListenProgress({ timestamp, position });

            if (!this.isSessionStillPlaying(position) && !['paused', 'stopped'].includes(this.calculatedStatus)) {

                this.calculatedStatus = this.reportedStatus === 'stopped' ? CALCULATED_PLAYER_STATUSES.stopped : CALCULATED_PLAYER_STATUSES.paused;

                if (this.reportedStatus !== this.calculatedStatus) {
                    this.logger.debug(`Reported status '${this.reportedStatus}' but track position has not progressed between two updates. Calculated player status is now ${this.calculatedStatus}`);
                } else {
                    this.logger.debug(`Player position is equal between current -> last update. Updated calculated status to ${this.calculatedStatus}`);
                }
            } else if (position !== oldEndProgress.position && this.calculatedStatus !== 'playing') {

                this.calculatedStatus = CALCULATED_PLAYER_STATUSES.playing;

                if (this.reportedStatus !== this.calculatedStatus) {
                    this.logger.debug(`Reported status '${this.reportedStatus}' but track position has progressed between two updates. Calculated player status is now ${this.calculatedStatus}`);
                } else {
                    this.logger.debug(`Player position changed between current -> last update. Updated calculated status to ${this.calculatedStatus}`);
                }
            }

            this.currentListenRange.setRangeEnd(newEndProgress);
        }
    }

    protected currentListenSessionEnd() {
        if (this.currentListenRange !== undefined && this.currentListenRange.getDuration() !== 0) {
            this.logger.debug('Ended current Player listen range.')
            let finalPosition: number;
            if([CALCULATED_PLAYER_STATUSES.playing, CALCULATED_PLAYER_STATUSES.stale].includes(this.calculatedStatus) && !this.currentListenRange.isInitial()) {
                const {
                    data: {
                        duration,
                    } = {}
                } = this.currentPlay;
                if(duration !== undefined && (duration - this.currentListenRange.end.position) < this.gracefulEndBuffer) {
                    // likely the track was listened to until it ended
                    // but polling interval or network delays caused MS to not get data on the very end
                    // also...within 3 seconds of ending is close enough to call this complete IMO
                    //
                    // -- STALE is included in this because there are some Sources (jellyfin or plex with 3rd party apps?)
                    // that will created a new "player" if the queue is cleared or stopping the player,
                    // from the user's perspective its all the same but then MS sees it as different
                    // so the player will eventually be pruned but we want to treat the play "going stale" it as if it finished to account for this behavior
                    this.logger.debug(`Listen duration was within ${this.gracefulEndBuffer}s of Play duration, bumping duration to 100% ${this.calculatedStatus === CALCULATED_PLAYER_STATUSES.stale ? 'because stale player probably finished Play before going dark.' : ' because we probably just missed Source reporting 100% before changing Play.'}`)
                    finalPosition = duration;
                    //this.currentListenRange.end.position = duration;

                } else if(this.calculatedStatus === CALCULATED_PLAYER_STATUSES.stale && this.currentListenRange.isOverDrifted(this.currentListenRange.end.position)) {
                    // if player uses realtime but source went stale and WAS NOT close to the end its likely the RT is way overdrifted
                    // in which case we definitely do want to use RT as final position
                    // so use last known position before stale instead
                    this.logger.debug(`Player became Stale and realtime position overdrifted before session ended! Using last known position instead of RT position so listen duration stays accurate.`);
                    finalPosition = this.currentListenRange.end.position;
                }
            }
            this.currentListenRange.finalize(finalPosition);
            this.listenRanges.push(this.currentListenRange);
        }
        this.currentListenRange = undefined;
    }

    public getPosition(): Second | undefined {
        if(this.calculatedStatus !== 'stopped' && this.currentListenRange !== undefined && this.rtTruth) {
            return this.currentListenRange.rtPlayer.getPosition(true);
        }
        return super.getPosition();
    }

}
