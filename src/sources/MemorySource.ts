import AbstractSource from "./AbstractSource.js";
import {playObjDataMatch, sortByPlayDate, buildTrackString} from "../utils.js";
import dayjs from "dayjs";

export default class MemorySource extends AbstractSource {
    /*
    * MemorySource uses its own state to maintain a list of recently played tracks and determine if a track is valid.
    * This is necessary for any source that
    *  * doesn't have its own source of truth for "recently played" or
    *  * that does not return "started at" and "duration" timestamps for recent plays or
    *  * where these timestamps don't have enough granularity (IE second accuracy)
    * such as subsonic and jellyfin */

    statefulRecentlyPlayed = [];
    candidateRecentlyPlayed = [];

    processRecentPlays = (plays: any) => {

        let newStatefulPlays: any = [];
        // first format new plays with locked play date
        const lockedPlays = plays.map((p: any) => {
                    const {data: {playDate, ...restData}, ...rest} = p;
                    return {data: {...restData, playDate: dayjs()}, ...rest};
        })
        // if no candidates exist new plays are new candidates
        if(this.candidateRecentlyPlayed.length === 0) {
            for(const p of lockedPlays) {
                this.logger.debug(`No prior candidate recent plays! Adding new locked plays: ${buildTrackString(p, {include: ['sourceId', 'artist', 'track']})}`);
            }
            this.candidateRecentlyPlayed = lockedPlays;
        } else {
            // otherwise determine new tracks (not found in prior candidates)
            const newTracks = lockedPlays.filter((x: any) => this.candidateRecentlyPlayed.every(y => !playObjDataMatch(y, x)));
            if(newTracks.length > 0) {
                for(const p of newTracks) {
                    this.logger.debug(`New play found that does not match existing candidates will be added: ${buildTrackString(p, {include: ['sourceId', 'artist', 'track']})}`);
                }
            }
            // filter prior candidates based on new recently played
            this.candidateRecentlyPlayed = this.candidateRecentlyPlayed.filter(x => {
                const candidateMatchedLocked = lockedPlays.some((y: any) => playObjDataMatch(x, y));
                if(!candidateMatchedLocked) {
                    this.logger.debug(`Existing candidate not found in locked plays will be removed: ${buildTrackString(x, {include: ['sourceId', 'artist', 'track']})}`);
                }
                return candidateMatchedLocked;
            });
            // and then combine still playing with new tracks
            this.candidateRecentlyPlayed = this.candidateRecentlyPlayed.concat(newTracks);
            this.candidateRecentlyPlayed.sort(sortByPlayDate);

            for(const candidate of this.candidateRecentlyPlayed) {
                const {data: {playDate, track}} = candidate;
                if(playDate.isBefore(dayjs().subtract(30, 's'))) {
                    // a prior candidate has been playing for more than 30 seconds, time to check statefuls

                    const matchingRecent = this.statefulRecentlyPlayed.find(x => playObjDataMatch(x, candidate));
                    let stPrefix = `(Stateful Play) ${buildTrackString(candidate, {include: ['sourceId', 'artist', 'track']})}`;
                    if(matchingRecent === undefined) {
                        this.logger.debug(`${stPrefix} added after being seen for 30 seconds and not matching any prior plays`);
                        newStatefulPlays.push(candidate);
                        this.statefulRecentlyPlayed.push(candidate);
                    } else {
                        const {data: { playDate, duration }} = candidate;
                        const {data: { playDate: rplayDate }} = matchingRecent;
                        if(!playDate.isSame(rplayDate)) {
                            if(duration !== undefined) {
                                if(playDate.isAfter(rplayDate.add(duration, 's'))) {
                                    this.logger.debug(`${stPrefix} added after being seen for 30 seconds and having a different timestamp than a prior play`);
                                    newStatefulPlays.push(candidate);
                                    this.statefulRecentlyPlayed.push(candidate);
                                }
                            } else if(!playObjDataMatch(this.statefulRecentlyPlayed[0], candidate)) {
                                // if most recent stateful play is not this track we'll add it
                                this.logger.debug(`${stPrefix} added after being seen for 30 seconds. Matched other recent play but could not determine time frame due to missing duration. Allowed due to not being last played track.`);
                                newStatefulPlays.push(candidate);
                                this.statefulRecentlyPlayed.push(candidate);
                            }
                        }
                    }
                }
            }
            this.statefulRecentlyPlayed.sort(sortByPlayDate);
        }
        return newStatefulPlays;
    }

    recentlyPlayedTrackIsValid = (playObj: any) => {
        return playObj.data.playDate.isBefore(dayjs().subtract(30, 's'));
    }
}
