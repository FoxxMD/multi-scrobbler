import type {PlayObject} from "../../../core/Atomic.ts";
import AbstractSource from "../../sources/AbstractSource.ts";
import { MemoryPositionalSource } from "../../sources/MemoryPositionalSource.ts";
import MemorySource from "../../sources/MemorySource.ts";

// production defaults wait/idle in hundreds of ms (queue idle before queueEmptied, stop() polling for processing to finish)
export class TestSource extends AbstractSource {
    override queueIdleMs: number = 1;
    override queueConcurrency: number = 1;
    override stopPollingWaitInterval: number = 10;
    handle(plays: PlayObject[]) {
        this.scrobble(plays);
    }
}

export class TestMemorySource extends MemorySource {
    override queueIdleMs: number = 1;
    override stopPollingWaitInterval: number = 10;
}

export class TestMemoryPositionalSource extends MemoryPositionalSource {
    override queueIdleMs: number = 1;
    override stopPollingWaitInterval: number = 10;
}