import { type Logger } from "@foxxmd/logging";
import { type InternalConfig, type PlayPlatformId } from "../common/infrastructure/Atomic.js";
import MemorySource from "./MemorySource.js";
import { type PlayerStateOptions } from "./PlayerState/AbstractPlayerState.js";
import { PositionalPlayerState } from "./PlayerState/PositionalPlayerState.js";
import { type SourceConfig, type SourceType } from "../common/infrastructure/config/source/sources.js";
import EventEmitter from "events";

export class MemoryPositionalSource extends MemorySource {
    constructor(type: SourceType, name: string, config: SourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super(type, name, config, internal, emitter);
        this.isPositional = true;
    }
    getNewPlayer = (logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions) => new PositionalPlayerState(logger, id, opts)
}