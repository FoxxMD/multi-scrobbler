import { PlayObject } from "../../../core/Atomic.js";
import AbstractSource from "../../sources/AbstractSource.js";

export class TestSource extends AbstractSource {
    handle(plays: PlayObject[]) {
        this.scrobble(plays);
    }
}
