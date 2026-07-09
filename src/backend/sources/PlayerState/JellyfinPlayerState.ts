import { type Logger } from "@foxxmd/logging";
import { type PlayerStateDataMaybePlay, type ReportedPlayerStatus } from "../../common/infrastructure/Atomic.ts";
import { type PlayPlatformId } from '../../../core/Atomic.ts';
import { type PlayerStateOptions } from "./AbstractPlayerState.ts";
import { PositionalPlayerState } from "./PositionalPlayerState.ts";

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
