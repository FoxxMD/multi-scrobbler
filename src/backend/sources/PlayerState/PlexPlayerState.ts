import { Logger } from "@foxxmd/logging";
import { PlayPlatformId, REPORTED_PLAYER_STATUSES } from "../../common/infrastructure/Atomic.ts";
import { AbstractPlayerState, PlayerStateOptions } from "./AbstractPlayerState.ts";
import { GenericPlayerState } from "./GenericPlayerState.ts";
import { PositionalPlayerState } from "./PositionalPlayerState.ts";

export class PlexPlayerState extends PositionalPlayerState {
    constructor(logger: Logger, platformId: PlayPlatformId, opts?: PlayerStateOptions) {
        super(logger, platformId, {allowedDrift: 17000, rtTruth: true, ...(opts || {})});
        this.gracefulEndBuffer = this.allowedDrift / 1000;
    }

    protected isSessionStillPlaying(position: number): boolean {
        return this.reportedStatus === REPORTED_PLAYER_STATUSES.playing;
    }
}
