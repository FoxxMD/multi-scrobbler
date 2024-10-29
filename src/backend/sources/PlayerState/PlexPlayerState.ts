import { Logger } from "@foxxmd/logging";
import { PlayPlatformId, REPORTED_PLAYER_STATUSES } from "../../common/infrastructure/Atomic.js";
import { AbstractPlayerState, PlayerStateOptions } from "./AbstractPlayerState.js";
import { GenericPlayerState } from "./GenericPlayerState.js";
import { PositionalPlayerState } from "./PositionalPlayerState.js";

export class PlexPlayerState extends PositionalPlayerState {
    constructor(logger: Logger, platformId: PlayPlatformId, opts?: PlayerStateOptions) {
        super(logger, platformId, {allowedDrift: 17000, rtTruth: true, ...(opts || {})});

    }

    protected isSessionStillPlaying(position: number): boolean {
        return this.reportedStatus === REPORTED_PLAYER_STATUSES.playing;
    }
}