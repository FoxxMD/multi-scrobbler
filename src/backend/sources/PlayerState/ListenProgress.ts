import dayjs, { type Dayjs } from "dayjs";

import type {PlayProgress, PlayProgressPositional, Second} from "../../../core/Atomic.ts";

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
            position: undefined as Second | undefined,
            positionPercent: this.positionPercent
        }
    }
}

export class ListenProgressPositional extends ListenProgressTS implements PlayProgressPositional {
    declare public position: Second;

    constructor(data: Partial<PlayProgress> & Pick<PlayProgressPositional, 'position'>) {
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
            positionPercent: undefined as number | undefined
        }
    }
}

export type ListenProgress = ListenProgressTS | ListenProgressPositional;