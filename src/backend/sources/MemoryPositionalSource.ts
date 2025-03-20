import { Logger } from "@foxxmd/logging";
import { InternalConfig, PlayerStateDataMaybePlay, PlayPlatformId, SourceType } from "../common/infrastructure/Atomic.js";
import MemorySource from "./MemorySource.js";
import { PlayerStateOptions } from "./PlayerState/AbstractPlayerState.js";
import { PositionalPlayerState } from "./PlayerState/PositionalPlayerState.js";
import { PlayObject } from "../../core/Atomic.js";
import { SourceConfig } from "../common/infrastructure/config/source/sources.js";
import EventEmitter from "events";

export class MemoryPositionalSource extends MemorySource {
    constructor(type: SourceType, name: string, config: SourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super(type, name, config, internal, emitter);
        this.isPositional = true;
    }
    getNewPlayer = (logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions) => new PositionalPlayerState(logger, id, opts)
}