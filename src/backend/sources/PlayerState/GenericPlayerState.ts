import { Logger } from "@foxxmd/logging";
import { PlayPlatformId } from "../../common/infrastructure/Atomic.js";
import { AbstractPlayerState, PlayerStateOptions } from "./AbstractPlayerState.js";

export class GenericPlayerState extends AbstractPlayerState {
    constructor(logger: Logger, platformId: PlayPlatformId, opts?: PlayerStateOptions) {
        super(logger, platformId, opts);
    }
}
