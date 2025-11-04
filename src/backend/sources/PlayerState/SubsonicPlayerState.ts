import { SourcePlayerObj } from "../../../core/Atomic.js";
import { GenericPlayerState } from "./GenericPlayerState.js";
import { Dayjs } from "dayjs";

export class SubsonicPlayerState extends GenericPlayerState {

    protected isSessionRepeat(position?: number, reportedTS?: Dayjs) {
        if(super.isSessionRepeat()) {
            return true;
        }
        // if track has a duration and the listened duration for this session is greater than 100% + 5% (for buffer)
        // then assume track is on repeat
        if(this.currentPlay.data.duration !== undefined && this.getListenDuration() > (this.currentPlay.data.duration + (0.05 * this.currentPlay.data.duration))) {
            this.logger.debug('Listened duration for this session is over 105%, triggering as a repeat');
            return true;
        }
        return false;
    }
}