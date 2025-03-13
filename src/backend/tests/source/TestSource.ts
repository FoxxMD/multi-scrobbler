import { PlayObject } from "../../../core/Atomic.js";
import AbstractSource from "../../sources/AbstractSource.js";
import { MemoryPositionalSource } from "../../sources/MemoryPositionalSource.js";
import MemorySource from "../../sources/MemorySource.js";

export class TestSource extends AbstractSource {
    handle(plays: PlayObject[]) {
        this.scrobble(plays);
    }
}

export class TestMemorySource extends MemoryPositionalSource {

}

export class TestMemoryPositionalSource extends MemoryPositionalSource {

}