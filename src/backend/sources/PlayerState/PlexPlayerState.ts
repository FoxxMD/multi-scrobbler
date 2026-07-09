import { type Logger } from "@foxxmd/logging";
import { type PlayPlatformId, REPORTED_PLAYER_STATUSES } from "../../common/infrastructure/Atomic.ts";
import { AbstractPlayerState, type PlayerStateOptions } from "./AbstractPlayerState.ts";
import { GenericPlayerState } from "./GenericPlayerState.ts";
import { PositionalPlayerState } from "./PositionalPlayerState.ts";

export class PlexPlayerState extends PositionalPlayerState {
    constructor(logger: Logger, platformId: PlayPlatformId, opts?: PlayerStateOptions) {
        super(logger, platformId, {allowedDrift: 35000, rtTruth: true, ...(opts || {})});
        this.gracefulEndBuffer = this.allowedDrift / 1000;
    }

    protected isSessionStillPlaying(position: number): boolean {
        return this.reportedStatus === REPORTED_PLAYER_STATUSES.playing;
    }
}
