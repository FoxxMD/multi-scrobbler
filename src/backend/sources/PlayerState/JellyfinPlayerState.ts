import { Logger } from "@foxxmd/logging";
import { PlayObject } from "../../../core/Atomic.ts";
import { PlayerStateDataMaybePlay, PlayPlatformId, ReportedPlayerStatus } from "../../common/infrastructure/Atomic.ts";
import { PlayerStateOptions } from "./AbstractPlayerState.ts";
import { GenericPlayerState } from "./GenericPlayerState.ts";
import { PositionalPlayerState } from "./PositionalPlayerState.ts";

export class JellyfinPlayerState extends PositionalPlayerState {
    constructor(logger: Logger, platformId: PlayPlatformId, opts?: PlayerStateOptions) {
        super(logger, platformId, opts);
    }

    update(state: PlayerStateDataMaybePlay) {
        let stat: ReportedPlayerStatus = state.status;
        if(stat === undefined && state.play?.meta?.event === 'PlaybackProgress') {
            stat = 'playing';
        }
        return super.update({...state, status: stat});
    }
}
