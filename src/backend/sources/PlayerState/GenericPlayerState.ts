import { Logger } from "@foxxmd/logging";
import { CALCULATED_PLAYER_STATUSES, PlayPlatformId } from "../../common/infrastructure/Atomic.js";
import { AbstractPlayerState, PlayerStateOptions } from "./AbstractPlayerState.js";
import { PlayProgress } from "../../../core/Atomic.js";
import { ListenProgress, ListenProgressTS } from "./ListenProgress.js";
import { ListenRange, ListenRangeTS } from "./ListenRange.js";
import { Dayjs } from "dayjs";

export class GenericPlayerState extends AbstractPlayerState {
    protected newListenProgress(data?: Partial<PlayProgress>): ListenProgress {
        return new ListenProgressTS(data);
    }

    protected newListenRange(start?: ListenProgress, end?: ListenProgress, options?: object): ListenRange {
        return new ListenRangeTS(start, end);
    }

    constructor(logger: Logger, platformId: PlayPlatformId, opts?: PlayerStateOptions) {
        super(logger, platformId, opts);
    }
    
    protected currentListenSessionContinue(position: number = 0, timestamp?: Dayjs) {
        if (this.currentListenRange === undefined) {
            this.logger.debug('Started new Player listen range.');
            this.currentListenRange = this.newListenRange(this.newListenProgress({timestamp}));
        } else {
            this.calculatedStatus = CALCULATED_PLAYER_STATUSES.playing;
            this.currentListenRange.setRangeEnd(this.newListenProgress({timestamp}));
        }
    }

    protected currentListenSessionEnd() {
        if (this.currentListenRange !== undefined && this.currentListenRange.getDuration() !== 0) {
            this.logger.debug('Ended current Player listen range.')
            this.currentListenRange.finalize();
            this.listenRanges.push(this.currentListenRange);
        }
        this.currentListenRange = undefined;
    }
}
