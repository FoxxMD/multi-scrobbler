import { PlayObject } from "../../../core/Atomic.ts";
import AbstractSource from "../../sources/AbstractSource.ts";
import { MemoryPositionalSource } from "../../sources/MemoryPositionalSource.ts";
import MemorySource from "../../sources/MemorySource.ts";

export class TestSource extends AbstractSource {
    handle(plays: PlayObject[]) {
        this.scrobble(plays);
    }
}

export class TestMemorySource extends MemoryPositionalSource {

}

export class TestMemoryPositionalSource extends MemoryPositionalSource {

}