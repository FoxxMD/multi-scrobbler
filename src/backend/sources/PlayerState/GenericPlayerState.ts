import { AbstractPlayerState, PlayerStateOptions } from "./AbstractPlayerState.js";
import {Logger} from "@foxxmd/winston";
import { PlayPlatformId } from "../../common/infrastructure/Atomic.js";

export class GenericPlayerState extends AbstractPlayerState {
    constructor(logger: Logger, platformId: PlayPlatformId, opts?: PlayerStateOptions) {
        super(logger, platformId, opts);
    }
}
