import dayjs, { Dayjs } from "dayjs";

import { PlayProgress, Second } from "../../../core/Atomic.js";

export class ListenProgress implements PlayProgress {

    public timestamp: Dayjs;
    public position?: Second;
    public positionPercent?: number;

    constructor(timestamp?: Dayjs, position?: number, positionPercent?: number) {
        this.timestamp = timestamp ?? dayjs();
        this.position = position;
        this.positionPercent = positionPercent;
    }

    getDuration(end: ListenProgress): Second {
        if (this.position !== undefined && end.position !== undefined) {
            return end.position - this.position;
        } else {
            return end.timestamp.diff(this.timestamp, 'seconds');
        }
    }

    toJSON() {
        return {
            timestamp: this.timestamp.toISOString(),
            position: this.position,
            positionPercent: this.positionPercent
        }
    }
}
