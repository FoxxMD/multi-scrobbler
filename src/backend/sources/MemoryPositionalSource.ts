import { Logger } from "@foxxmd/logging";
import { InternalConfig, PlayerStateDataMaybePlay, PlayPlatformId, SourceType } from "../common/infrastructure/Atomic.ts";
import MemorySource from "./MemorySource.ts";
import { PlayerStateOptions } from "./PlayerState/AbstractPlayerState.ts";
import { PositionalPlayerState } from "./PlayerState/PositionalPlayerState.ts";
import { PlayObject } from "../../core/Atomic.ts";
import { SourceConfig } from "../common/infrastructure/config/source/sources.ts";
import EventEmitter from "events";

export class MemoryPositionalSource extends MemorySource {
    constructor(type: SourceType, name: string, config: SourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super(type, name, config, internal, emitter);
        this.isPositional = true;
    }
    getNewPlayer = (logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions) => new PositionalPlayerState(logger, id, opts)
}