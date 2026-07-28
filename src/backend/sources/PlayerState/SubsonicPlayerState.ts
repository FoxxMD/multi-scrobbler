import type {Dayjs} from "dayjs";
import { type AbstractPlayerState } from "./AbstractPlayerState.ts";
import type {PlayerStateDataMaybePlay} from "../../common/infrastructure/Atomic.ts";
import { PositionalPlayerState } from "./PositionalPlayerState.ts";
import { type ListenRange, ListenRangeTS } from "./ListenRange.ts";
import { ListenProgressTS } from "./ListenProgress.ts";
import { CALCULATED_PLAYER_STATUSES, type Second } from "../../../core/Atomic.ts";

export class SubsonicPlayerState extends PositionalPlayerState {

    update(state: PlayerStateDataMaybePlay, reportedTS?: Dayjs) {
        const range = this.activeRange;
        const usesPosition = state.position !== undefined;
        if (range !== undefined && range.isPositional() !== usesPosition) {
            // Timestamp and position ranges measure different coordinates and cannot be combined -> Finalize the current listen session and start a new one afterwards.
            this.currentListenSessionEnd();
        }
        return super.update(state, reportedTS);
    }

    protected currentListenSessionContinue(position?: number, timestamp?: Dayjs) {
        if (position !== undefined) {
            return super.currentListenSessionContinue(position, timestamp);
        }

        if (this.activeRange === undefined) {
            this.logger.debug('Started new Player listen range.');
            this.activeRange = new ListenRangeTS(new ListenProgressTS({timestamp}));
        } else {
            this.calculatedStatus = CALCULATED_PLAYER_STATUSES.playing;
            this.activeRange.setRangeEnd(new ListenProgressTS({timestamp}));
        }
    }

    protected currentListenSessionEnd() {
        const range = this.activeRange;
        if (range?.isPositional()) {
            return super.currentListenSessionEnd();
        }
        if (range !== undefined && range.getDuration() !== 0) {
            this.logger.debug('Ended current Player listen range.');
            range.finalize();
            this.basePlayer.listenRanges.push(range);
        }
        this.activeRange = undefined;
    }

    public getPosition(): Second | undefined {
        if (!this.activeRange?.isPositional()) {
            return this.activeRange?.getPosition();
        }
        return super.getPosition();
    }

    protected isSessionRepeat(position?: number, reportedTS?: Dayjs) {
        if (this.activeRange?.isPositional()) {
            return super.isSessionRepeat(position, reportedTS);
        }
        // if track has a duration and the listened duration for this session is greater than 100% + 5% (for buffer)
        // then assume track is on repeat
        if(this.currentPlay.data.duration !== undefined && this.getListenDuration() > (this.currentPlay.data.duration + (0.05 * this.currentPlay.data.duration))) {
            this.logger.debug('Listened duration for this session is over 105%, triggering as a repeat');
            return true;
        }
        return false;
    }

    // Use base player listen range, to be able to set a timestamp-based listen range.
    private get basePlayer(): AbstractPlayerState {
        return this as AbstractPlayerState;
    }

    private get activeRange(): ListenRange | undefined {
        return this.basePlayer.currentListenRange;
    }

    private set activeRange(range: ListenRange | undefined) {
        this.basePlayer.currentListenRange = range;
    }
}
