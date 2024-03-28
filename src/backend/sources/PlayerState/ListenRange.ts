import dayjs, { Dayjs } from "dayjs";
import { ListenRangeData, Second } from "../../../core/Atomic.js";
import { ListenProgress } from "./ListenProgress.js";

export class ListenRange implements ListenRangeData {

    public start: ListenProgress;
    public end: ListenProgress;

    constructor(start?: ListenProgress, end?: ListenProgress) {
        const s = start ?? new ListenProgress();
        const e = end ?? s;

        this.start = s;
        this.end = e;
    }

    isPositional() {
        return this.start.position !== undefined && this.end.position !== undefined;
    }

    isInitial() {
        if (this.isPositional()) {
            return this.start.position === this.end.position;
        }
        return this.start.timestamp.isSame(this.end.timestamp);
    }

    seeked(position?: number, reportedTS: Dayjs = dayjs()): [boolean, Second?] {
        if (position === undefined || this.isInitial() || !this.isPositional()) {
            return [false];
        }
        // if (new) position is earlier than last stored position then the user has seeked backwards on the player
        if (position < this.end.position) {
            return [true, position - this.end.position];
        }

        // if (new) position is more than a reasonable number of ms ahead of real time than they have seeked forwards on the player
        const realTimeDiff = Math.max(0, reportedTS.diff(this.end.timestamp, 'ms')); // 0 max used so TS from testing doesn't cause "backward" diff
        const positionDiff = (position - this.end.position) * 1000;
        // if user is more than 2.5 seconds ahead of real time
        if (positionDiff - realTimeDiff > 2500) {
            return [true, position - this.end.position];
        }

        return [false];
    }

    setRangeStart(data: ListenProgress | { position?: number, timestamp?: Dayjs, positionPercent?: number }) {
        if (data instanceof ListenProgress) {
            this.start = data;
        } else {
            const d = data || {};
            this.start = new ListenProgress(d.timestamp, d.position, d.positionPercent)
        }
    }

    setRangeEnd(data: ListenProgress | { position?: number, timestamp?: Dayjs, positionPercent?: number }) {
        if (data instanceof ListenProgress) {
            this.end = data;
        } else {
            const d = data || {};
            this.end = new ListenProgress(d.timestamp, d.position, d.positionPercent)
        }
    }

    getDuration(): Second {
        return this.start.getDuration(this.end);
    }

    toJSON() {
        return [this.start, this.end];
    }
}
