import { Logger } from "@foxxmd/logging";
import { PlayPlatformId, REPORTED_PLAYER_STATUSES } from "../../common/infrastructure/Atomic.js";
import { AbstractPlayerState, PlayerStateOptions } from "./AbstractPlayerState.js";
import { GenericPlayerState } from "./GenericPlayerState.js";

export class PlexPlayerState extends GenericPlayerState {
    constructor(logger: Logger, platformId: PlayPlatformId, opts?: PlayerStateOptions) {
        super(logger, platformId, opts);
        this.allowedDrift = 17000;
    }

    protected isSessionStillPlaying(position: number): boolean {
        return this.reportedStatus === REPORTED_PLAYER_STATUSES.playing;
    }
}
