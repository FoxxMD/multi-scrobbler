import { Logger } from "@foxxmd/logging";
import { PlayerStateDataMaybePlay, PlayPlatformId } from "../common/infrastructure/Atomic.js";
import MemorySource from "./MemorySource.js";
import { PlayerStateOptions } from "./PlayerState/AbstractPlayerState.js";
import { PositionalPlayerState } from "./PlayerState/PositionalPlayerState.js";
import { PlayObject } from "../../core/Atomic.js";

export class MemoryPositionalSource extends MemorySource {
    getNewPlayer = (logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions) => new PositionalPlayerState(logger, id, opts)
}