import dayjs, { Dayjs } from "dayjs";

import { PlayProgress, PlayProgressPositional, Second } from "../../../core/Atomic.js";

export class ListenProgressTS implements PlayProgress {

    public timestamp: Dayjs;
    public positionPercent?: number;
    public position?: Second;

    constructor(data: Partial<PlayProgress> = {}) {
        const {timestamp, positionPercent, position} = data;
        this.timestamp = timestamp ?? dayjs();
        this.positionPercent = positionPercent;
        this.position = position;
    }

    getDuration(end: ListenProgressTS): Second {
        return end.timestamp.diff(this.timestamp, 'seconds');
    }

    toJSON() {
        return {
            timestamp: this.timestamp.toISOString(),
            position: undefined,
            positionPercent: this.positionPercent
        }
    }
}

export class ListenProgressPositional extends ListenProgressTS implements PlayProgressPositional {
    declare public position: Second;

    constructor(data: PlayProgressPositional) {
        super(data);
        const {timestamp, position} = data;
        this.timestamp = timestamp ?? dayjs();
        this.position = position;
    }

    getDuration(end: ListenProgressPositional): Second {
        return end.position - this.position;
    }


    toJSON() {
        return {
            timestamp: this.timestamp.toISOString(),
            position: this.position,
            positionPercent: undefined
        }
    }
}

export type ListenProgress = ListenProgressTS | ListenProgressPositional;