import { GenericPlayerState } from "./GenericPlayerState";
import {Logger} from "@foxxmd/winston";
import { PlayPlatformId, ReportedPlayerStatus } from "../../common/infrastructure/Atomic";
import { PlayerStateOptions } from "./AbstractPlayerState";
import { PlayObject } from "../../../core/Atomic";

export class JellyfinPlayerState extends GenericPlayerState {
    constructor(logger: Logger, platformId: PlayPlatformId, opts?: PlayerStateOptions) {
        super(logger, platformId, opts);
    }

    setState(status?: ReportedPlayerStatus, play?: PlayObject) {
        let stat: ReportedPlayerStatus = status;
        if(status === undefined && play.meta?.event === 'PlaybackProgress') {
            stat = 'playing';
        }
        return super.setState(stat, play);
    }
}
