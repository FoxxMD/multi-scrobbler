import AbstractSource from "./AbstractSource";
import {
    playObjDataMatch,
    sortByOldestPlayDate,
    toProgressAwarePlayObject,
    getProgress,
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
    GroupedPlays, InternalConfig,
    PlayerStateData,
    PlayPlatformId,
    PlayUserId,
    ProgressAwarePlayObject,
    ScrobbleThresholdResult, SourceType,
} from "../common/infrastructure/Atomic";
import TupleMap from "../common/TupleMap";
import { AbstractPlayerState, PlayerStateOptions } from "./PlayerState/AbstractPlayerState";
import { GenericPlayerState } from "./PlayerState/GenericPlayerState";
import {Logger} from "@foxxmd/winston";
import {PlayObject, SourcePlayerObj} from "../../core/Atomic";
import { buildTrackString } from "../../core/StringUtils";
import {SimpleIntervalJob, Task, ToadScheduler} from "toad-scheduler";
import {SourceConfig} from "../common/infrastructure/config/source/sources";
import {EventEmitter} from "events";
import objectHash from 'object-hash';

export default class MemorySource extends AbstractSource {

    playerSourceOfTruth: boolean = true;

    /*
    * MemorySource uses its own state to maintain a list of recently played tracks and determine if a track is valid.
    * This is necessary for any source that
    *  * doesn't have its own source of truth for "recently played" or
    *  * that does not return "started at" and "duration" timestamps for recent plays or
    *  * where these timestamps don't have enough granularity (IE second accuracy)
    * such as subsonic and jellyfin */

    players: Map<string, AbstractPlayerState> = new Map();
    playerState: Map<string, string> = new Map();

    scheduler: ToadScheduler = new ToadScheduler();

    constructor(type: SourceType, name: string, config: SourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super(type, name, config, internal, emitter);
        this.scheduler.addSimpleIntervalJob(new SimpleIntervalJob({seconds: 15}, new Task('Player Cleanup', () => {
            this.cleanupPlayers();
        })));
    }

    cleanupPlayers = () => {
        const deadPlatformIds: string[] = [];
        for (const [key, player] of this.players.entries()) {
            // no communication from the source was received for this player
            const isStale = player.checkStale();
            if (isStale && player.checkOrphaned() && player.isDead()) {
                player.logger.debug(`Removed after being orphaned for ${dayjs.duration(player.stateIntervalOptions.orphanedInterval, 'seconds').asMinutes()} minutes`);
                deadPlatformIds.push(player.platformIdStr);
                this.emitEvent('playerDelete', {platformId: player.platformIdStr});
            } else if (isStale) {
                const state = player.getApiState();
                // @ts-ignore
                const stateHash = objectHash.sha1(state);
                if(stateHash !== this.playerState.get(key)) {
                    this.playerState.set(key, stateHash);
                    this.emitEvent('playerUpdate', state);
                }
                if(this.config.options?.logPlayerState === true) {
                    player.logSummary();
                }
            }
        }
        for (const deadId of deadPlatformIds) {
            this.deletePlayer(deadId);
        }
    }

    playersToObject = (): Record<string, SourcePlayerObj> => {
        if(this.players.size === 0) {
            return {};
        }
        const record: Record<string, SourcePlayerObj> = {};
        for(const [k,v] of this.players.entries()) {
            record[k] = v.getApiState();
        }
        return record;
    }

    getNewPlayer = (logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions) => {
        return new GenericPlayerState(logger, id, opts);
    }

    setNewPlayer = (idStr: string, logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions = {}) => {
        this.players.set(idStr, this.getNewPlayer(this.logger, id, {
            staleInterval: (this.config.data.interval ?? 30) * 3,
            orphanedInterval: (this.config.data.maxInterval ?? 60) * 5,
            ...opts
        }));
        this.playerState.set(idStr, '');
    }

    deletePlayer = (id: string) => {
        this.players.delete(id);
        this.playerState.delete(id);
    }

    processRecentPlays = (datas: (PlayObject | PlayerStateData)[]) => {

        const {
            data: {
                scrobbleThresholds = {}
            } = {}
        } = this.config;

        const newStatefulPlays: PlayObject[] = [];

        // create any new players from incoming data
        for (const data of datas) {
            const id = getPlatformIdFromData(data);
            const idStr = genGroupIdStr(id);
            if (!this.players.has(idStr)) {
                this.setNewPlayer(idStr, this.logger, id);
            }
        }

        //const deadPlatformIds: string[] = [];

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
                            if(this.playerSourceOfTruth) {
                                player.logger.debug(`${stPrefix} added after ${thresholdResultSummary(thresholdResults)} and not matching any prior plays`);
                            }
                            newStatefulPlays.push(candidate);
                        } else {
                            const {data: {playDate, duration}} = candidate;
                            const {data: {playDate: rplayDate}} = matchingRecent;
                            if (!playDate.isSame(rplayDate)) {
                                if (duration !== undefined) {
                                    if (playDate.isAfter(rplayDate.add(duration, 's'))) {
                                        if(this.playerSourceOfTruth) {
                                            player.logger.debug(`${stPrefix} added after ${thresholdResultSummary(thresholdResults)} and having a different timestamp than a prior play`);
                                        }
                                        newStatefulPlays.push(candidate);
                                    }
                                } else {
                                    const discoveredPlays = this.getRecentlyDiscoveredPlaysByPlatform(genGroupId(candidate));
                                    if (discoveredPlays.length === 0 || !playObjDataMatch(discoveredPlays[0], candidate)) {
                                        // if most recent stateful play is not this track we'll add it
                                        if(this.playerSourceOfTruth) {
                                            player.logger.debug(`${stPrefix} added after ${thresholdResultSummary(thresholdResults)}. Matched other recent play but could not determine time frame due to missing duration. Allowed due to not being last played track.`);
                                        }
                                        newStatefulPlays.push(candidate);
                                    }
                                }
                            }
                        }
                    }
                }

                if(this.config.options?.logPlayerState === true) {
                    player.logSummary();
                }
                const apiState = player.getApiState();
                // @ts-ignore
                this.playerState.set(key, objectHash.sha1(apiState))
                this.emitEvent('playerUpdate', apiState);
            }
        }

        return newStatefulPlays;
    }

    recentlyPlayedTrackIsValid = (playObj: any) => {
        return playObj.data.playDate.isBefore(dayjs().subtract(30, 's'));
    }
}

function sortByPlayDate(a: ProgressAwarePlayObject, b: ProgressAwarePlayObject): number {
    throw new Error("Function not implemented.");
}

