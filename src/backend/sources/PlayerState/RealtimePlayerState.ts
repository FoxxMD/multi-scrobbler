import { Logger } from "@foxxmd/logging";
import { PlayPlatformId, REPORTED_PLAYER_STATUSES } from "../../common/infrastructure/Atomic.js";
import { AbstractPlayerState, PlayerStateOptions } from "./AbstractPlayerState.js";
import { GenericPlayerState } from "./GenericPlayerState.js";
import { GenericRealtimePlayer, RealtimePlayer } from "./RealtimePlayer.js";
import { Second } from "../../../core/Atomic.js";
import { Dayjs } from "dayjs";

// export class RealtimePlayerState extends GenericPlayerState {

//     rtPlayer: RealtimePlayer;
//     //allowedDrift: number;

//     constructor(logger: Logger, platformId: PlayPlatformId, opts?: PlayerStateOptions) {
//         super(logger, platformId, opts);
//         this.rtPlayer = new GenericRealtimePlayer(logger);
//         const {
//             allowedDrift = 3000
//         } = opts || {};
//         this.allowedDrift = 3000;
//     }

//     protected isSessionStillPlaying(position: number): boolean {
//         return this.reportedStatus === REPORTED_PLAYER_STATUSES.playing;
//     }

//     public getPosition(): Second | undefined {
//         if(this.calculatedStatus === 'stopped') {
//             return undefined;
//         }
//         return this.rtPlayer.getPosition();
//     }

//     protected currentListenSessionEnd() {
//         super.currentListenSessionEnd();
//         this.rtPlayer.pause();
//     }
//     protected currentListenSessionContinue(position?: number, timestamp?: Dayjs) {
//         const rt = this.rtPlayer.getPosition(true);
//             if(Math.abs(position - rt) > this.allowedDrift) {
//                 this.logger.debug(`Reported position (${position}s) has drifted from real-time (${rt}s) more than allowed (${this.allowedDrift}ms)`);
//             }
//     }
// }
