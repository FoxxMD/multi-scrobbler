import { Logger } from "@foxxmd/logging";
import { PlayObject } from "../../../core/Atomic.js";
import { PlayerStateDataMaybePlay, PlayPlatformId, ReportedPlayerStatus } from "../../common/infrastructure/Atomic.js";
import { PlayerStateOptions } from "./AbstractPlayerState.js";
import { GenericPlayerState } from "./GenericPlayerState.js";

export class JellyfinPlayerState extends GenericPlayerState {
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
