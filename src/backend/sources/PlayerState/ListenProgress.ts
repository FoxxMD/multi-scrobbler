import dayjs, {Dayjs} from "dayjs";

import {PlayProgress} from "../../../core/Atomic";

export class ListenProgress implements PlayProgress {

    public timestamp: Dayjs;
    public position?: number;
    public positionPercent?: number;

    constructor(timestamp?: Dayjs, position?: number, positionPercent?: number) {
        this.timestamp = timestamp ?? dayjs();
        this.position = position;
        this.positionPercent = positionPercent;
    }

    getDuration(end: ListenProgress) {
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
