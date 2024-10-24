import { Logger } from "@foxxmd/logging";
import dayjs from "dayjs";
import { EventEmitter } from "events";
import objectHash from 'object-hash';
import { SimpleIntervalJob, Task, ToadScheduler } from "toad-scheduler";
import { PlayObject, SOURCE_SOT, SOURCE_SOT_TYPES, SourcePlayerObj } from "../../core/Atomic.js";
import { buildTrackString } from "../../core/StringUtils.js";
import {
    asPlayerStateData,
    asPlayerStateDataMaybePlay,
    CALCULATED_PLAYER_STATUSES,
    InternalConfig,
    PlayerStateData,
    PlayerStateDataMaybePlay,
    PlayPlatformId,
    ProgressAwarePlayObject,
    SourceType,
} from "../common/infrastructure/Atomic.js";
import { PollingOptions } from "../common/infrastructure/config/common.js";
import { SourceConfig } from "../common/infrastructure/config/source/sources.js";
import {
    formatNumber,
    genGroupId,
    genGroupIdStr,
    getPlatformIdFromData,
    playObjDataMatch,
    thresholdResultSummary,
} from "../utils.js";
import { timePassesScrobbleThreshold } from "../utils/TimeUtils.js";
import AbstractSource from "./AbstractSource.js";
import { AbstractPlayerState, createPlayerOptions, PlayerStateOptions } from "./PlayerState/AbstractPlayerState.js";
import { GenericPlayerState } from "./PlayerState/GenericPlayerState.js";

export default class MemorySource extends AbstractSource {

    playerSourceOfTruth: SOURCE_SOT_TYPES = SOURCE_SOT.PLAYER;

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
        const deadPlatformIds: [string, string?][] = [];
        for (const [key, player] of this.players.entries()) {
            // no communication from the source was received for this player
            const isStale = player.checkStale();
            if (isStale && player.checkOrphaned() && player.isDead()) {
                deadPlatformIds.push([player.platformIdStr, `Removed after being orphaned for ${dayjs.duration(player.stateIntervalOptions.orphanedInterval, 'seconds').asMinutes()} minutes`]);
            } else if (isStale) {
                const state = player.getApiState();
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
        for (const [deadId, reason] of deadPlatformIds) {
            this.deletePlayer(deadId, reason);
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

    getNewPlayer = (logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions) => new GenericPlayerState(logger, id, opts)

    setNewPlayer = (idStr: string, logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions = {}) => {
        this.players.set(idStr, this.getNewPlayer(this.logger, id, {
            ...createPlayerOptions(this.config.data as Partial<PollingOptions>),
            ...opts
        }));
        this.playerState.set(idStr, '');
    }

    hasPlayer = (data: string | PlayerStateDataMaybePlay): boolean => {
        let id: string;
        if(typeof data === 'string') {
            id = data;
        } else {
            id = genGroupIdStr(getPlatformIdFromData(data));
        }
        return this.players.has(id);
    }

    deletePlayer = (id: string, reason?: string) => {
        if(!this.players.has(id)) {
            return;
        }
        if(reason !== undefined) {
            this.players.get(id)?.logger.debug(reason);
        }
        this.players.delete(id);
        this.playerState.delete(id);
        this.emitEvent('playerDelete', {platformId: id});
    }

    processRecentPlays = (datas: (PlayObject | PlayerStateDataMaybePlay)[]) => {

        const {
            options: {
                scrobbleThresholds = {}
            }
        } = this.config;

        const newStatefulPlays: PlayObject[] = [];

        // create any new players from incoming data
        for (const data of datas) {
            const id = getPlatformIdFromData(data);
            const idStr = genGroupIdStr(id);
            if (!this.players.has(idStr)) {
                this.setNewPlayer(idStr, this.logger, id);

                if(!this.multiPlatform && this.players.size > 1) {
                    // new platform should have old platform data transferred
                    const [id,firstPlayer] = Array.from(this.players.entries())[0];
                    const newPlayer = this.players.get(idStr);
                    firstPlayer.transferToNewPlayer(newPlayer);
                    this.deletePlayer(id, 'Removed due to player transfer');
                }
            }
        }

        for (const [key, player] of this.players.entries()) {

            let incomingData: PlayObject | PlayerStateDataMaybePlay;
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

                let playerState: PlayerStateDataMaybePlay;
                if(asPlayerStateDataMaybePlay(incomingData)) {
                    playerState = incomingData;
                } else {
                    playerState = {play: incomingData, platformId: getPlatformIdFromData(incomingData)};
                }

                const [currPlay, prevPlay] = player.update(playerState);
                const candidate = prevPlay !== undefined ? prevPlay : currPlay;
                const playChanged = prevPlay !== undefined;

                // wait to discover play until it is stale or current play has changed
                // so that our discovered track has an accurate "listenedFor" count
                if (candidate !== undefined && (playChanged || player.isUpdateStale())) {
                    const stPrefix = `${buildTrackString(candidate, {include: ['trackId', 'artist', 'track']})}`;
                    const thresholdResults = timePassesScrobbleThreshold(scrobbleThresholds, candidate.data.listenedFor, candidate.data.duration);

                    if (thresholdResults.passes) {
                        const matchingRecent = this.existingDiscovered(candidate); //sRecentlyPlayed.find(x => playObjDataMatch(x, candidate));
                        if (matchingRecent === undefined) {
                            if(this.playerSourceOfTruth === SOURCE_SOT.PLAYER) {
                                player.logger.verbose(`${stPrefix} added after ${thresholdResultSummary(thresholdResults)} and not matching any prior plays`);
                            }
                            newStatefulPlays.push(candidate);
                        } else {
                            const {data: {playDate, duration}} = candidate;
                            const {data: {playDate: rplayDate}} = matchingRecent;
                            if (!playDate.isSame(rplayDate)) {
                                if (duration !== undefined) {
                                    if (playDate.isAfter(rplayDate.add(duration, 's'))) {
                                        if(this.playerSourceOfTruth === SOURCE_SOT.PLAYER) {
                                            player.logger.verbose(`${stPrefix} added after ${thresholdResultSummary(thresholdResults)} and having a different timestamp than a prior play`);
                                        }
                                        newStatefulPlays.push(candidate);
                                    }
                                } else {
                                    const discoveredPlays = this.getRecentlyDiscoveredPlaysByPlatform(genGroupId(candidate));
                                    if (discoveredPlays.length === 0 || !playObjDataMatch(discoveredPlays[0], candidate)) {
                                        // if most recent stateful play is not this track we'll add it
                                        if(this.playerSourceOfTruth === SOURCE_SOT.PLAYER) {
                                            player.logger.verbose(`${stPrefix} added after ${thresholdResultSummary(thresholdResults)}. Matched other recent play but could not determine time frame due to missing duration. Allowed due to not being last played track.`);
                                        }
                                        newStatefulPlays.push(candidate);
                                    }
                                }
                            }
                        }
                    } else if(playChanged && this.playerSourceOfTruth === SOURCE_SOT.PLAYER) {
                        player.logger.verbose(`${stPrefix} not added because ${thresholdResultSummary(thresholdResults)}.`);
                    }
                }

                if(this.config.options?.logPlayerState === true) {
                    player.logSummary();
                }
                const apiState = player.getApiState();
                this.playerState.set(key, objectHash.sha1(apiState))
                this.emitEvent('playerUpdate', apiState);
            }
        }

        return newStatefulPlays;
    }

    recentlyPlayedTrackIsValid = (playObj: any) => playObj.data.playDate.isBefore(dayjs().subtract(30, 's'))

    protected getInterval(): number {
        /**
         * If any player is progressing, reports position, and play has duration
         * then we can modify polling interval so that we check source data just before track is supposed to end
         * which will give us more accurate data on when player moves to the next play = better duration reporting to scrobble clients
         * -- additionally, will have better confidence for fudging 100% duration played
         * */
        let interval = super.getInterval();
        if(this.players.size === 0) {
            return interval;
        }
        let logDecrease: undefined | string;
        for(const player of this.players.values()) {
            if(player.calculatedStatus === CALCULATED_PLAYER_STATUSES.playing) {
                const pos = player.getPosition();
                if(pos !== undefined && player.currentPlay !== undefined) {
                    const {
                        data: {
                            duration
                        } = {}
                    } = player.currentPlay;
                    const remaining = duration - pos;
                    if(remaining < interval + 2) {
                        // interval should be at least 1 second so we don't spam sources when polling
                        interval = Math.max(1, remaining - 2);
                        logDecrease = `Temporarily decreasing polling interval to ${formatNumber(interval)}s due to Player ${player.platformIdStr} reporting track duration remaining (${formatNumber(remaining)}s) less than normal interval (${formatNumber(super.getInterval())}s)`;
                    }
                }
            }
        }
        if(logDecrease !== undefined) {
            this.logger.debug(logDecrease);
        }
        return interval;
    }

    public async destroy() {
        this.scheduler.stop();
        await super.destroy();
    }
}

const sortByPlayDate = (a: ProgressAwarePlayObject, b: ProgressAwarePlayObject): number => {
    throw new Error("Function not implemented.");
};

