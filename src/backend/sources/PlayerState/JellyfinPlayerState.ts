import { type Logger } from "@foxxmd/logging";
import { type PlayObject } from "../../../core/Atomic.js";
import { type PlayerStateDataMaybePlay, type PlayPlatformId, type ReportedPlayerStatus } from "../../common/infrastructure/Atomic.js";
import { type PlayerStateOptions } from "./AbstractPlayerState.js";
import { GenericPlayerState } from "./GenericPlayerState.js";
import { PositionalPlayerState } from "./PositionalPlayerState.js";

export class JellyfinPlayerState extends PositionalPlayerState {
    constructor(logger: Logger, platformId: PlayPlatformId, opts?: PlayerStateOptions) {
        super(logger, platformId, opts);
    }

    update(state: PlayerStateDataMaybePlay) {
        let stat: ReportedPlayerStatus = state.status;
        // if(stat === undefined && state.play?.meta?.event === 'PlaybackProgress') {
        //     stat = 'playing';
        // }
        return super.update({...state, status: stat});
    }
}
