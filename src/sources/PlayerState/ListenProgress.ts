import dayjs, {Dayjs} from "dayjs";
import {PlayProgress} from "../../common/infrastructure/Atomic.js";

export class ListenProgress implements PlayProgress {

    constructor(
        public timestamp: Dayjs = dayjs(),
        public position?: number,
        public positionPercent?: number
    ) {
    }

    getDuration(end: ListenProgress) {
        if (this.position !== undefined && end.position !== undefined) {
            return end.position - this.position;
        } else {
            return end.timestamp.diff(this.timestamp, 'seconds');
        }
    }
}
