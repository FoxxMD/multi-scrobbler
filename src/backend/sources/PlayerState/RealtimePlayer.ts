import { childLogger, Logger } from "@foxxmd/logging";
import dayjs, { Dayjs } from "dayjs";
import { SimpleIntervalJob, Task, ToadScheduler } from "toad-scheduler";

const RT_TICK = 500;

export abstract class RealtimePlayer {

    //logger: Logger;
    scheduler: ToadScheduler = new ToadScheduler();

    protected position: number = 0;
    private clockTS: Dayjs = dayjs();

    protected constructor(/* logger: Logger */) {
        this.position = 0;
        const job = new SimpleIntervalJob({
            milliseconds: RT_TICK,
            runImmediately: true
        }, new Task('updatePos', () => {
            // in production RT_TICK and the diff between now and clockTS should always be the same
            // but in order to mock for testing (where we manipulate Date now()) the source of truth
            // needs to come from TS rather than simple TICK increase
            this.setPosition()
            //this.position += Math.abs(dayjs().diff(this.clockTS, 'ms')); // RT_TICK

        }), { id: 'rt' });
        this.scheduler.addSimpleIntervalJob(job);
        this.scheduler.stop();
    }

    public play(position?: number) {
        if (position !== undefined) {
            this.position = position;
        }
        this.clockTS = dayjs();
        this.scheduler.startById('rt');
    }

    public pause() {
        this.scheduler.stop();
    }

    public stop() {
        this.pause();
        this.position = 0;
    }

    public seek(position: number) {
        this.position = position;
    }

    public getPosition(asSeconds: boolean = false) {
        if(this.position === 0 || this.position === undefined) {
            return 0;
        }
        return !asSeconds ? this.position : this.position / 1000;
    }

    public setPosition(time?: number) {
        if(time === undefined) {
            this.position += Math.abs(dayjs().diff(this.clockTS, 'ms'));
        } else {
            this.position = time;
        }
        this.clockTS = dayjs();
    }
}

export class GenericRealtimePlayer extends RealtimePlayer {
    constructor(/* logger: Logger */) {
        super();
    }
}