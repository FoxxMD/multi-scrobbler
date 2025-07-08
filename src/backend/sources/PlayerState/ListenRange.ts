import dayjs, { Dayjs } from "dayjs";
import { ListenRangeData, Millisecond, PlayProgress, PlayProgressPositional, Second } from "../../../core/Atomic.js";
import { ListenProgress, ListenProgressPositional,  ListenProgressTS } from "./ListenProgress.js";
import { GenericRealtimePlayer, RealtimePlayer } from "./RealtimePlayer.js";

export abstract class ListenRange {
    public start: ListenProgress;
    public end: ListenProgress;

    constructor(start?: ListenProgress, end?: ListenProgress) {
        const s = start ?? new ListenProgressTS();
        const e = end ?? s;

        this.start = s;
        this.end = e;
    }

    public abstract isPositional(): boolean;
    public abstract isInitial(): boolean;
    public abstract seeked(position?: number, reportedTS?: Dayjs): [boolean, Second?];
    public abstract setRangeStart(data: ListenProgress | Partial<PlayProgress>);
    public abstract setRangeEnd(data: ListenProgress | Partial<PlayProgress>);
    public abstract getDuration(): Second;
    public abstract getPosition(): Second | undefined;
    public abstract finalize(position?: number);
    public abstract toJSON();
}

export class ListenRangeTS extends ListenRange implements ListenRangeData {

    declare public start: ListenProgressTS;
    declare public end: ListenProgressTS;

    isPositional() {
        return false;
    }

    isInitial() {
        return this.start.timestamp.isSame(this.end.timestamp);
    }

    seeked(position?: number, reportedTS: Dayjs = dayjs()): [boolean, Second?] {
        return [false];
    }

    setRangeStart(data: ListenProgress | Partial<PlayProgress>) {
        if (data instanceof ListenProgressTS) {
            this.start = data;
        } else {
            const d = data || {};
            this.start = new ListenProgressTS(d)
        }
    }

    setRangeEnd(data: ListenProgress | Partial<PlayProgress>) {
        if (data instanceof ListenProgressTS) {
            this.end = data;
        } else {
            const d = data || {};
            this.end = new ListenProgressTS(d)
        }
    }

    getDuration(): Second {
        return this.start.getDuration(this.end);
    }

    public getPosition(): Second {
        return this.end.position;
    }

    public finalize(position?: number) {
    }

    toJSON() {
        return [this.start, this.end];
    }
}

export class ListenRangePositional extends ListenRange {

    declare public start: ListenProgressPositional
    declare public end: ListenProgressPositional;
    public rtPlayer: RealtimePlayer;
    protected finalized: boolean;
    rtTruth: boolean;

    protected allowedDrift: number;

    constructor(start?: ListenProgressPositional, end?: ListenProgressPositional, options: {rtTruth?: boolean, allowedDrift?: number, rtImmediate?: boolean} = {}) {
        super(start, end);
        const { allowedDrift = 2000, rtTruth = false, rtImmediate = true } = options;
        this.allowedDrift = allowedDrift;
        this.rtTruth = rtTruth;
        this.rtPlayer = new GenericRealtimePlayer();
        this.rtPlayer.setPosition(start.position * 1000);
        if(rtImmediate) {
            this.rtPlayer.play();
        }
        this.finalized = false;
    }

    isPositional(): boolean {
        return true;
    }

    isInitial() {
        return this.start.position === this.end.position;
    }

    seeked(position: Second, reportedTS: Dayjs = dayjs()): [boolean, Millisecond?] {
        // if (new) position is earlier than last stored position then the user has seeked backwards on the player
        if (position < this.end.position) {
            return [true, (position - this.end.position) * 1000];
        }

        // if (new) position is more than a reasonable number of ms ahead of real time than they have seeked forwards on the player
        //const realTimeDiff = Math.max(0, reportedTS.diff(this.end.timestamp, 'ms')); // 0 max used so TS from testing doesn't cause "backward" diff
        //const positionDiff = (position - this.end.position) * 1000;
        // if user is more than 2.5 seconds ahead of real time
        if (this.isOverDrifted(position)) {
            return [true, this.getDrift(position)];
        }

        return [false];
    }

    setRangeStart(data: ListenProgressPositional | PlayProgressPositional) {
        if (data instanceof ListenProgressPositional) {
            this.start = data;
        } else {
            //const d = data || {};
            this.start = new ListenProgressPositional(data)
        }
        this.rtPlayer.stop();
        this.rtPlayer.play(this.start.position);
    }

    getDrift(position?: Second): Millisecond {
            return ((position ?? this.end.position) * 1000) - this.rtPlayer.getPosition();
    }

    isOverDrifted(position: Second): boolean {
        return Math.abs(this.getDrift((position ?? this.end.position))) > this.allowedDrift;
    }

    getAllowedDrift() {
        return this.allowedDrift;
    }

    setRangeEnd(data: ListenProgressPositional | PlayProgressPositional/* , force?: boolean */) {
        const endProgress = data instanceof ListenProgressPositional ? data : new ListenProgressPositional(data)
        // if(this.rtTruth) {
        //     if(!this.isOverDrifted(endProgress.position) && !force) {
        //         endProgress.position = this.rtPlayer.getPosition();
        //     } else {
        //         // if we've drifted too far sync RT to reported position
        //         this.rtPlayer.setPosition(endProgress.position);
        //     }
        // }
        this.end = endProgress;
    }

    finalize(position?: number) {
        this.rtPlayer.pause();
        this.finalized = true;
        let finalPosition = position;
        if(finalPosition === undefined && this.rtTruth) {
            finalPosition = this.rtPlayer.getPosition(true);
        }

        if(finalPosition !== undefined) {
            this.end.position = finalPosition;
        }
    }

    public getPosition(): Second | undefined {
        if(this.rtTruth && !this.finalized) {
            this.rtPlayer.getPosition();
        }
        return this.end.position;
    }

    getDuration(): Second {
        return this.start.getDuration(this.end);
    }

    toJSON() {
        return [this.start, this.end];
    }
}