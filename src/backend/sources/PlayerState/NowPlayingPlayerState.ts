import { SourcePlayerObj } from "../../../core/Atomic.js";
import { GenericPlayerState } from "./GenericPlayerState.js";

/**
 * This Player is only used for displaying data reported to EndpointListenbrainzSource, and parsed from ListenbrainzSource, as playing_now
 * and the behvior for Listenbrainz server is to display playing now info with a timeout equal to duraion of the submitted track
 * https://github.com/FoxxMD/multi-scrobbler/discussions/338
 * 
 * We'll use duration as a generic timeout for any Source that *only* parses Now Playing data for Player
 */
export class NowPlayingPlayerState extends GenericPlayerState {

    protected getStaleInterval() {
        if(this.currentPlay !== undefined && this.currentPlay.data.duration !== undefined) {
            return this.currentPlay.data.duration;
        }
        return super.getStaleInterval();
    }

    protected getOrphanedInterval() {
        if(this.currentPlay !== undefined && this.currentPlay.data.duration !== undefined) {
            // want this player to clear Now Playing as soon as track is finished
            return (this.currentPlay.data.duration / 2) + 1;
        }
        return super.getOrphanedInterval();
    }

    public isDead() {
        return this.isOrphaned();
    }

    public getApiState(): SourcePlayerObj {
        const data = super.getApiState();
        data.nowPlayingMode = true;
        return data;
    }

}