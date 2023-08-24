import AbstractSource from "./AbstractSource";
import {
    playObjDataMatch,
    sortByOldestPlayDate,
    toProgressAwarePlayObject,
    getProgress,
    genGroupIdStrFromPlay,
    playPassesScrobbleThreshold,
    timePassesScrobbleThreshold,
    thresholdResultSummary,
    genGroupId,
    genGroupIdStr,
    getPlatformIdFromData,
} from "../utils";
import dayjs from "dayjs";
import {
    asPlayerStateData,
    DeviceId,
    GroupedPlays,
    PlayerStateData,
    PlayPlatformId,
    PlayUserId,
    ProgressAwarePlayObject,
    ScrobbleThresholdResult,
} from "../common/infrastructure/Atomic";
import TupleMap from "../common/TupleMap";
import { AbstractPlayerState, PlayerStateOptions } from "./PlayerState/AbstractPlayerState";
import { GenericPlayerState } from "./PlayerState/GenericPlayerState";
import {Logger} from "@foxxmd/winston";
import { PlayObject } from "../../core/Atomic";
import { buildTrackString } from "../../core/StringUtils";

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
    //statefulRecentlyPlayed: GroupedPlays = new Map();
    /**
     * Tracks that are actively being tracked (discovered from source recently) to see if they will "qualify" as being played.
     *
     * Once a track qualifies it is added to statefuls.
     * */
    candidateRecentlyPlayed: GroupedPlays = new TupleMap<DeviceId, PlayUserId, ProgressAwarePlayObject[]>

    players: Map<string, AbstractPlayerState> = new Map();

    getFlatCandidateRecentlyPlayed = (): PlayObject[] => {
        // TODO sort?
        return Array.from(this.candidateRecentlyPlayed.values()).flat();
    }

    getNewPlayer = (logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions) => {
        return new GenericPlayerState(logger, id, opts);
    }

    processRecentPlaysNew = (datas: (PlayObject | PlayerStateData)[]) => {

        const {
            data: {
                scrobbleThresholds = {}
            } = {}
        } = this.config;

        const newStatefulPlays: PlayObject[] = [];

        // create any new players from incoming data
        //const incomingPlatformIds: PlayPlatformId[] = [];
        for (const data of datas) {
            const id = getPlatformIdFromData(data);
            const idStr = genGroupIdStr(id);
            if (!this.players.has(idStr)) {
                //incomingPlatformIds.push(id);
                this.players.set(idStr, this.getNewPlayer(this.logger, id, {
                    staleInterval: (this.config.data.interval ?? 30) * 3,
                    orphanedInterval: (this.config.data.maxInterval ?? 60) * 5
                }));
            }
        }

        const deadPlatformIds: string[] = [];

        for (const [key, player] of this.players.entries()) {

            let incomingData: PlayObject | PlayerStateData;
            // get all incoming datas relevant for each player (this should only be one)
            const relevantDatas = datas.filter(x => {
                const id = getPlatformIdFromData(x);
                return player.platformEquals(id);
            });

            // we've received some form of communication from the source for this player
            if (relevantDatas.length > 0) {
                this.lastActivityAt = dayjs();

                if (relevantDatas.length > 1) {
                    this.logger.warn(`More than one data/state for Player ${player.platformIdStr} found in incoming data, will only use first found.`);
                }
                incomingData = relevantDatas[0];

                const [currPlay, prevPlay] = asPlayerStateData(incomingData) ? player.setState(incomingData.status, incomingData.play) : player.setState(undefined, incomingData);
                const candidate = prevPlay !== undefined ? prevPlay : currPlay;

                if (candidate !== undefined) {
                    const thresholdResults = timePassesScrobbleThreshold(scrobbleThresholds, candidate.data.listenedFor, candidate.data.duration);

                    if (thresholdResults.passes) {
                        const matchingRecent = this.existingDiscovered(candidate); //sRecentlyPlayed.find(x => playObjDataMatch(x, candidate));
                        let stPrefix = `${buildTrackString(candidate, {include: ['trackId', 'artist', 'track']})}`;
                        if (matchingRecent === undefined) {
                            player.logger.debug(`${stPrefix} added after ${thresholdResultSummary(thresholdResults)} and not matching any prior plays`);
                            newStatefulPlays.push(candidate);
                        } else {
                            const {data: {playDate, duration}} = candidate;
                            const {data: {playDate: rplayDate}} = matchingRecent;
                            if (!playDate.isSame(rplayDate)) {
                                if (duration !== undefined) {
                                    if (playDate.isAfter(rplayDate.add(duration, 's'))) {
                                        player.logger.debug(`${stPrefix} added after ${thresholdResultSummary(thresholdResults)} and having a different timestamp than a prior play`);
                                        newStatefulPlays.push(candidate);
                                    }
                                } else {
                                    const discoveredPlays = this.getRecentlyDiscoveredPlaysByPlatform(genGroupId(candidate));
                                    if (discoveredPlays.length === 0 || !playObjDataMatch(discoveredPlays[0], candidate)) {
                                        // if most recent stateful play is not this track we'll add it
                                        player.logger.debug(`${stPrefix} added after ${thresholdResultSummary(thresholdResults)}. Matched other recent play but could not determine time frame due to missing duration. Allowed due to not being last played track.`);
                                        newStatefulPlays.push(candidate);
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                // no communication from the source was received for this player
                player.checkStale();
                if (player.checkOrphaned() && player.isDead()) {
                    player.logger.debug(`Removed after being orphaned for ${dayjs.duration(player.stateIntervalOptions.orphanedInterval, 'seconds').asMinutes()} minutes`);
                    deadPlatformIds.push(player.platformIdStr);
                }
            }
            if(this.config.options?.logPlayerState === true) {
                player.logSummary();
            }
        }
        for (const deadId of deadPlatformIds) {
            this.players.delete(deadId);
        }

        return newStatefulPlays;
    }

    processRecentPlays = (plays: PlayObject[], useExistingPlayDate = false) => {

        const {
            data: {
                scrobbleThresholds = {}
            } = {}
        } = this.config;

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

        for (const [groupId, lockedPlays] of groupedLockedPlays.entries()) {
            const groupIdStr = `${groupId[0]}-${groupId[1]}`;
            let cRecentlyPlayed = this.candidateRecentlyPlayed.get(groupId) ?? [];
            // if no candidates exist new plays are new candidates
            if (cRecentlyPlayed.length === 0) {
                this.logger.debug(`[Platform ${groupIdStr}] No prior candidate recent plays!`)
                // update activity date here so that polling interval decreases *before* we get a new valid play
                // so that we don't miss a play due to long polling interval
                this.lastActivityAt = dayjs();
                const progressAware: ProgressAwarePlayObject[] = [];
                for (const p of lockedPlays) {
                    progressAware.push(toProgressAwarePlayObject(p));
                    this.logger.debug(`[Platform ${groupIdStr}] Adding new locked play: ${buildTrackString(p, {include: ['trackId', 'artist', 'track']})}`);
                }
                this.candidateRecentlyPlayed.set(groupId, progressAware)
            } else {
                // otherwise determine new tracks (not found in prior candidates)
                const newTracks = lockedPlays.filter((x: any) => cRecentlyPlayed.every(y => !playObjDataMatch(y, x)));
                const newProgressAwareTracks: ProgressAwarePlayObject[] = [];
                if (newTracks.length > 0) {
                    // update activity date here so that polling interval decreases *before* we get a new valid play
                    // so that we don't miss a play due to long polling interval
                    this.lastActivityAt = dayjs();
                    this.logger.debug(`[Platform ${groupIdStr}] New plays found that do not match existing candidates.`)
                    for (const p of newTracks) {
                        this.logger.debug(`[Platform ${groupIdStr}] Adding new locked play: ${buildTrackString(p, {include: ['trackId', 'artist', 'track']})}`);
                        newProgressAwareTracks.push(toProgressAwarePlayObject(p));
                    }
                }
                // filter prior candidates based on new recently played
                cRecentlyPlayed = cRecentlyPlayed.filter(x => {
                    const candidateMatchedLocked = lockedPlays.some((y: any) => playObjDataMatch(x, y));
                    if (!candidateMatchedLocked) {
                        this.logger.debug(`[Platform ${groupIdStr}] Existing candidate not found in locked plays will be removed: ${buildTrackString(x, {include: ['trackId', 'artist', 'track']})}`);
                    }
                    return candidateMatchedLocked;
                });
                // and then combine still playing with new tracks
                cRecentlyPlayed = cRecentlyPlayed.concat(newProgressAwareTracks);
                cRecentlyPlayed.sort(sortByOldestPlayDate);

                this.candidateRecentlyPlayed.set(groupId, cRecentlyPlayed);

                //const sRecentlyPlayed = this.statefulRecentlyPlayed.get(groupId) ?? [];

                // now we check if all candidates pass tests for having been tracked long enough:
                // * Has been tracked for at least [duration] seconds or [percentage] of track duration
                // * If it has playback position data then it must also have progressed at least [duration] seconds or [percentage] of track duration progress since our initial tracking data
                for (const candidate of cRecentlyPlayed) {
                    let thresholdResults: ScrobbleThresholdResult;
                    thresholdResults = playPassesScrobbleThreshold(candidate, scrobbleThresholds);
                    const {passes: firstSeenValid} = thresholdResults;
                    let progressValid = firstSeenValid;
                    if (firstSeenValid) {
                        // check if we can get progress as well
                        const matchingLockedPlay = lockedPlays.find(x => playObjDataMatch(x, candidate));
                        // this should always be found but checking just in case
                        if (matchingLockedPlay !== undefined) {
                            const progress = getProgress(candidate, matchingLockedPlay);
                            if (progress !== undefined) {
                                thresholdResults = timePassesScrobbleThreshold(scrobbleThresholds, progress, candidate.data.duration);
                                const {passes: progressPasses} = thresholdResults;
                                progressValid = progressPasses;
                            }
                        }
                    }

                    if (firstSeenValid && progressValid) {
                        // a prior candidate has been playing for more than 30 seconds and passed progress test, time to check statefuls

                        const matchingRecent = this.existingDiscovered(candidate); //sRecentlyPlayed.find(x => playObjDataMatch(x, candidate));
                        let stPrefix = `[Platform ${groupId}] (Stateful Play) ${buildTrackString(candidate, {include: ['trackId', 'artist', 'track']})}`;
                        if (matchingRecent === undefined) {
                            this.logger.debug(`${stPrefix} added after ${thresholdResultSummary(thresholdResults)} and not matching any prior plays`);
                            newStatefulPlays.push(candidate);
                            //sRecentlyPlayed.push(candidate);
                        } else {
                            const {data: {playDate, duration}} = candidate;
                            const {data: {playDate: rplayDate}} = matchingRecent;
                            if (!playDate.isSame(rplayDate)) {
                                if (duration !== undefined) {
                                    if (playDate.isAfter(rplayDate.add(duration, 's'))) {
                                        this.logger.debug(`${stPrefix} added after ${thresholdResultSummary(thresholdResults)} and having a different timestamp than a prior play`);
                                        newStatefulPlays.push(candidate);
                                        //sRecentlyPlayed.push(candidate);
                                    }
                                } else {
                                    const discoveredPlays = this.getRecentlyDiscoveredPlaysByPlatform(genGroupId(candidate));
                                    if (discoveredPlays.length === 0 || !playObjDataMatch(discoveredPlays[0], candidate)) {
                                        // if most recent stateful play is not this track we'll add it
                                        this.logger.debug(`${stPrefix} added after ${thresholdResultSummary(thresholdResults)}. Matched other recent play but could not determine time frame due to missing duration. Allowed due to not being last played track.`);
                                        newStatefulPlays.push(candidate);
                                    }
                                    //sRecentlyPlayed.push(candidate);
                                }
                            }
                        }
                    }
                }
                //sRecentlyPlayed.sort(sortByPlayDate);
                //this.statefulRecentlyPlayed.set(groupId, sRecentlyPlayed);
            }
        }
        return newStatefulPlays;
        //return this.getFlatStatefulRecentlyPlayed();
        //return newStatefulPlays;
    }

    recentlyPlayedTrackIsValid = (playObj: any) => {
        return playObj.data.playDate.isBefore(dayjs().subtract(30, 's'));
    }
}

function sortByPlayDate(a: ProgressAwarePlayObject, b: ProgressAwarePlayObject): number {
    throw new Error("Function not implemented.");
}

