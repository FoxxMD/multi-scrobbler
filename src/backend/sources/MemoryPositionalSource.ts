import type {Logger} from "@foxxmd/logging";
import type {InternalConfig} from "../common/infrastructure/Atomic.ts";
import type {PlayPlatformId} from '../../core/Atomic.ts';
import MemorySource from "./MemorySource.ts";
import type {PlayerStateOptions} from "./PlayerState/AbstractPlayerState.ts";
import { PositionalPlayerState } from "./PlayerState/PositionalPlayerState.ts";
import type {SourceConfig} from "../common/infrastructure/config/source/sources.ts";
import type {SourceType} from "../../core/Atomic.ts";
import type EventEmitter from "events";

export class MemoryPositionalSource extends MemorySource {
    constructor(type: SourceType, name: string, config: SourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super(type, name, config, internal, emitter);
        this.isPositional = true;
    }
    getNewPlayer = (logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions) => new PositionalPlayerState(logger, id, opts)
}