import AbstractSource from "./AbstractSource.js";
import {playObjDataMatch, sortByPlayDate, buildTrackString, toProgressAwarePlayObject, getProgress} from "../utils.js";
import dayjs from "dayjs";
import {PlayObject, ProgressAwarePlayObject} from "../common/infrastructure/Atomic.js";

export type GroupedPlays = Map<string, ProgressAwarePlayObject[]>;

const genGroupId = (play: PlayObject) => `${play.meta.deviceId ?? 'NoDevice'}-${play.meta.user ?? 'SingleUser'}`;

export default class MemorySource extends AbstractSource {
    /*
    * MemorySource uses its own state to maintain a list of recently played tracks and determine if a track is valid.
    * This is necessary for any source that
    *  * doesn't have its own source of truth for "recently played" or
    *  * that does not return "started at" and "duration" timestamps for recent plays or
    *  * where these timestamps don't have enough granularity (IE second accuracy)
    * such as subsonic and jellyfin */

    /**
     * Tracks we are tracked that we are confident qualified as being played based on:
     *
     * - MS saw the track for the first time while it was running/polling
     * - Continued to see this same track through consecutive polling/ingress events for AT LEAST 30 seconds
     *   - If the play info contains playback position data we also check if that has progressed at least 30 seconds
     *
     * These are tracks that are actually used by the source to scrobble to clients
     * */
    statefulRecentlyPlayed: GroupedPlays = new Map();
    /**
     * Tracks that are actively being tracked (discovered from source recently) to see if they will "qualify" as being played.
     *
     * Once a track qualifies it is added to statefuls.
     * */
    candidateRecentlyPlayed: GroupedPlays = new Map();

    getFlatStatefulRecentlyPlayed = (): PlayObject[] => {
        return Array.from(this.statefulRecentlyPlayed.values()).flat().sort(sortByPlayDate);
    }

    processRecentPlays = (plays: PlayObject[], useExistingPlayDate = false) => {

        let newStatefulPlays: PlayObject[] = [];
        // if we can't trust existing play dates (like for subsonic where there is no timestamp) then
        // we format new plays with locked play date IE the first time we have "seen" this track

        // -- otherwise, for sources like Spotify that accurately report when track started to play, we can use existing dates
        const flatLockedPlays = useExistingPlayDate ? plays : plays.map((p: any) => {
                    const {data: {playDate, ...restData}, ...rest} = p;
                    return {data: {...restData, playDate: dayjs()}, ...rest};
        });
        // group by device-user
        const groupedLockedPlays = flatLockedPlays.reduce((acc: GroupedPlays, curr: ProgressAwarePlayObject) => {
            const id = genGroupId(curr);
            acc.set(id, (acc.get(id) ?? []).concat(curr));
            return acc;
        }, new Map());

        for(const [groupId, lockedPlays] of groupedLockedPlays.entries()) {
            let cRecentlyPlayed = this.candidateRecentlyPlayed.get(groupId) ?? [];
            // if no candidates exist new plays are new candidates
            if(cRecentlyPlayed.length === 0) {
                this.logger.debug(`[Platform ${groupId}] No prior candidate recent plays!`)
                const progressAware: ProgressAwarePlayObject[] = [];
                for(const p of lockedPlays) {
                    progressAware.push(toProgressAwarePlayObject(p));
                    this.logger.debug(`[Platform ${groupId}] Adding new locked play: ${buildTrackString(p, {include: ['trackId', 'artist', 'track']})}`);
                }
                this.candidateRecentlyPlayed.set(groupId, progressAware)
            } else {
                // otherwise determine new tracks (not found in prior candidates)
                const newTracks = lockedPlays.filter((x: any) => cRecentlyPlayed.every(y => !playObjDataMatch(y, x)));
                const newProgressAwareTracks: ProgressAwarePlayObject[] = [];
                if(newTracks.length > 0) {
                    this.logger.debug(`[Platform ${groupId}] New plays found that do not match existing candidates.`)
                    for(const p of newTracks) {
                        this.logger.debug(`[Platform ${groupId}] Adding new locked play: ${buildTrackString(p, {include: ['trackId', 'artist', 'track']})}`);
                        newProgressAwareTracks.push(toProgressAwarePlayObject(p));
                    }
                }
                // filter prior candidates based on new recently played
                cRecentlyPlayed = cRecentlyPlayed.filter(x => {
                    const candidateMatchedLocked = lockedPlays.some((y: any) => playObjDataMatch(x, y));
                    if(!candidateMatchedLocked) {
                        this.logger.debug(`[Platform ${groupId}] Existing candidate not found in locked plays will be removed: ${buildTrackString(x, {include: ['trackId', 'artist', 'track']})}`);
                    }
                    return candidateMatchedLocked;
                });
                // and then combine still playing with new tracks
                cRecentlyPlayed = cRecentlyPlayed.concat(newProgressAwareTracks);
                cRecentlyPlayed.sort(sortByPlayDate);

                this.candidateRecentlyPlayed.set(groupId, cRecentlyPlayed);

                const sRecentlyPlayed = this.statefulRecentlyPlayed.get(groupId) ?? [];

                // now we check if all candidates pass tests for having been tracked long enough:
                // * Has been tracked for at least 30 seconds
                // * If it has playback position data then it must also have progressed at least 30 seconds since our initial tracking data
                for(const candidate of cRecentlyPlayed) {
                    const {data: {playDate, track}} = candidate;
                    const firstSeenValid = playDate.isBefore(dayjs().subtract(30, 's'));
                    let progressValid = firstSeenValid;
                    if (firstSeenValid) {
                        // check if we can get progress as well
                        const matchingLockedPlay = lockedPlays.find(x => playObjDataMatch(x, candidate));
                        // this should always be found but checking just in case
                        if (matchingLockedPlay !== undefined) {
                            const progress = getProgress(candidate, matchingLockedPlay);
                            if (progress !== undefined) {
                                if (progress < 30) {
                                    progressValid = false;
                                }
                            }
                        }
                    }

                    if(firstSeenValid && progressValid) {
                        // a prior candidate has been playing for more than 30 seconds and passed progress test, time to check statefuls

                        const matchingRecent = sRecentlyPlayed.find(x => playObjDataMatch(x, candidate));
                        let stPrefix = `[Platform ${groupId}] (Stateful Play) ${buildTrackString(candidate, {include: ['trackId', 'artist', 'track']})}`;
                        if(matchingRecent === undefined) {
                            this.logger.debug(`${stPrefix} added after being seen for 30 seconds and not matching any prior plays`);
                            newStatefulPlays.push(candidate);
                            sRecentlyPlayed.push(candidate);
                        } else {
                            const {data: { playDate, duration }} = candidate;
                            const {data: { playDate: rplayDate }} = matchingRecent;
                            if(!playDate.isSame(rplayDate)) {
                                if(duration !== undefined) {
                                    if(playDate.isAfter(rplayDate.add(duration, 's'))) {
                                        this.logger.debug(`${stPrefix} added after being seen for 30 seconds and having a different timestamp than a prior play`);
                                        newStatefulPlays.push(candidate);
                                        sRecentlyPlayed.push(candidate);
                                    }
                                } else if(!playObjDataMatch(sRecentlyPlayed[0], candidate)) {
                                    // if most recent stateful play is not this track we'll add it
                                    this.logger.debug(`${stPrefix} added after being seen for 30 seconds. Matched other recent play but could not determine time frame due to missing duration. Allowed due to not being last played track.`);
                                    newStatefulPlays.push(candidate);
                                    sRecentlyPlayed.push(candidate);
                                }
                            }
                        }
                    }
                }
                sRecentlyPlayed.sort(sortByPlayDate);
                this.statefulRecentlyPlayed.set(groupId, sRecentlyPlayed);
            }
        }
        return this.getFlatStatefulRecentlyPlayed();
        //return newStatefulPlays;
    }

    recentlyPlayedTrackIsValid = (playObj: any) => {
        return playObj.data.playDate.isBefore(dayjs().subtract(30, 's'));
    }
}
