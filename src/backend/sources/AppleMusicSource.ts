import dayjs, { type Dayjs } from "dayjs";
import type EventEmitter from "events";
import pMap from 'p-map';
import { MusicKit, type MeHistoryRecentlyPlayedTracksProps, type Song } from "node-musickit-api";
import { COMPONENT_AUTH_TYPE, type ComponentAuthType, type PlayObject, type PlayObjectMinimal } from "../../core/Atomic.ts";
import type { InternalConfig } from "../common/infrastructure/Atomic.ts";
import type { AppleMusicSourceConfig } from "../common/infrastructure/config/source/applemusic.ts";
import AbstractSource, { type RecentlyPlayedOptions } from "./AbstractSource.ts";
import { artistNamesToCredits } from "../../core/StringUtils.ts";
import { baseFormatPlayObj } from "../utils/PlayTransformUtils.ts";
import {
    getPlaysDiff,
    humanReadableDiff,
    type PlayOrderChangeType,
    type PlayOrderConsistencyResults,
    playsAreAddedOnly,
    playsAreBumpedOnly,
    playsAreSortConsistent
} from "../utils/PlayComparisonUtils.ts";
import { SimpleError } from "../common/errors/MSErrors.ts";

export type AppleMusicHistoryDiffType = 'bump' | 'added' | 'top-rebound';

export interface HistoryConsistencyResult {
    plays: PlayObject[];
    consistent: boolean;
    diffType?: AppleMusicHistoryDiffType;
    diffResults?: PlayOrderConsistencyResults<PlayOrderChangeType>;
    reason?: string;
}

export default class AppleMusicSource extends AbstractSource {

    private readonly MAX_HISTORY_KEPT = 3;
    private readonly POLL_TRACK_LIMIT = 20;
    private readonly UPSTREAM_TRACK_LIMIT = 30;

    override authType: ComponentAuthType = COMPONENT_AUTH_TYPE.unattended;
    requiresAuth = true;
    requiresAuthInteraction = false;

    declare config: AppleMusicSourceConfig

    recentlyPlayed: PlayObject[] = [];
    musicKit!: MusicKit;
    private storefront?: string | null;

    recentChangedHistoryResponses: {ts: Dayjs, plays: PlayObject[]}[] = [];

    constructor(name: string, config: AppleMusicSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('applemusic', name, config, internal, emitter);
        this.canPoll = true;
        this.canBacklog = false;
        this.supportsUpstreamRecentlyPlayed = true;
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            key,
            token,
            mediaUserToken,
            origin,
        } = this.config.data || {};

        if (!key && !token) {
            throw new Error('Either "key" or "token" config property is required for Apple Music authentication');
        }
        if (!mediaUserToken) {
            throw new Error('"mediaUserToken" config property is required for user-specific endpoints like recently played.');
        }

        if (key) {
            this.musicKit = new MusicKit({ key, mediaUserToken });
        } else {
            this.musicKit = new MusicKit({
                key: { id: '__token__', teamId: '__token__', p8: '__token__' },
                mediaUserToken,
            });
            this.musicKit.token = token!;
        }

        if (origin) {
            this.musicKit.headers = { Origin: origin };
        }

        return true;
    }

    doAuthentication = async (): Promise<boolean> => {
        try {
            if (this.config.data?.key) {
                await this.musicKit.auth();
            }

            const status = await this.musicKit.testAuth();

            if (status !== 200) {
                throw new Error(`Apple Music test auth returned status code ${status}`);
            }

            return true;
        } catch (e) {
            this.logger.error(new Error('Apple Music authentication failed', {cause: e}));
            throw e;
        }
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        if (this.config.data?.key) {
            await this.musicKit.auth();
        }

        const status = await this.musicKit.testAuth();

        if (status !== 200) {
            throw new Error(`Apple Music connection check failed with status ${status}`);
        }
        
        return `Apple Music API is reachable (status ${status})`;
    }

    static formatPlayObj(track: Song, options: {newFromSource?: boolean, normalizeAlbum?: boolean} = {}): PlayObject {
        const {newFromSource = false, normalizeAlbum = true} = options;

        let albumName = track.albumName
        if(normalizeAlbum) {
            // Apple Music appends " - EP" or " - Single" to the album name for EPs and singles
            // We strip this out so it matches other sources
            albumName = albumName.replace(/ - (EP|Single)$/i, '');
        }

        const play: PlayObjectMinimal = {
            data: {
                artists: artistNamesToCredits([track.artistName]),
                album: albumName,
                track: track.name,
                duration: track.durationInMillis ? Math.round(track.durationInMillis / 1000) : undefined,
                isrc: track.isrc
            },
            meta: {
                source: 'AppleMusic',
                musicService: 'Apple Music',
                trackId: track.id,
                newFromSource,
                url: {
                    web: track.url
                },
            }
        }
        return baseFormatPlayObj(track, play);
    }

    recentlyPlayedTrackIsValid = (playObj: PlayObject) => playObj.meta.newFromSource!

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        return this.getTracks(this.UPSTREAM_TRACK_LIMIT);
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        const plays = await this.getTracks(this.POLL_TRACK_LIMIT);
        return this.parseRecentAgainstResponse(plays).plays;
    }

    private getTracks = async (limit: number): Promise<PlayObject[]> => {
        const clampedLimit = Math.max(1, Math.min(this.UPSTREAM_TRACK_LIMIT, Math.round(limit)));
        const result = await this.musicKit.me.history.getRecentlyPlayedTracks({ limit: clampedLimit as MeHistoryRecentlyPlayedTracksProps["limit"], types: ["songs", "library-songs"] });
        if (result.error) {
            throw new Error(result.error);
        }
        if (!result.data) {
            return [];
        }
        const tracks = result.data as Song[];
        const plays = tracks.map(track => AppleMusicSource.formatPlayObj(track, {normalizeAlbum: this.config?.options?.normalizeAlbum}));
        return pMap(plays, (play, i) => this.enrichIsrc(play, tracks[i]), {concurrency: 3});
    }

    /**
     * Backfill ISRC if it is not present in Play
     *
     * The recently-played history endpoint returns full catalog data (including ISRC) for tracks of type
     * "songs", but tracks played from the user's personal library ("library-songs") often omit it. When those
     * library tracks are linked to a catalog song (`playParams.catalogId`) this makes one extra call to
     * `/catalog/{storefront}/songs/{catalogId}` to backfill and cache the ISRC from the catalog counterpart.
     */
    protected enrichIsrc = async (play: PlayObject, track: Song): Promise<PlayObject> => {
        if (this.config.options?.enrichIsrc === false || play.data.isrc !== undefined) {
            return play;
        }

        // library-song resources aren't typed with `catalogId` but Apple's API includes it on `playParams`
        // when the library item is linked to a matching catalog song
        const catalogId = track.type === 'songs' ? track.id : (track.playParams as { catalogId?: string } | undefined)?.catalogId;
        if (catalogId === undefined) {
            return play;
        }

        const cacheKey = `applemusic-isrc-${catalogId}`;
        try {
            let isrc = await this.cache.cacheApi.get<string | null>(cacheKey);
            if (isrc === undefined) {
                const storefront = await this.getStorefront();
                if (storefront === undefined || storefront === null) {
                    return play;
                }
                const res = await this.musicKit.songs.get(storefront, catalogId);
                isrc = (!res.error && res.data && res.data.length > 0) ? (res.data[0].isrc ?? null) : null;
                await this.cache.cacheApi.set(cacheKey, isrc, '3h');
            }
            if (isrc !== null) {
                play.data.isrc = isrc;
            }
        } catch (e) {
            this.logger.warn(new SimpleError(`Failed to backfill ISRC for Apple Music track ${catalogId} from catalog endpoint`, { cause: e }));
            // set to null on failure so we don't make consecutive calls that result in failure on every poll attempt
            await this.cache.cacheApi.set(cacheKey, null, '3h');
        }
        return play;
    }

    private getStorefront = async (): Promise<string | null | undefined> => {
        if (this.storefront !== undefined) {
            return this.storefront;
        }
        try {
            const res = await this.musicKit.me.getStorefront();
            if (res.error || !res.data || res.data.length === 0) {
                throw new Error(res.error ?? 'No storefront returned');
            }
            this.storefront = res.data[0].id;
        } catch (e) {
            this.logger.warn(new SimpleError('Could not determine Apple Music storefront, ISRC enrichment for library tracks will be skipped', { cause: e }));
            // store failure as non-undefined so we don't make consecutive calls to try to get storefront on failure
            this.storefront = null;
        }
        return this.storefront;
    }

    getIncomingHistoryConsistencyResult = (plays: PlayObject[]): HistoryConsistencyResult => {
        const results: HistoryConsistencyResult = {
            plays: [],
            consistent: true
        }

        if(playsAreSortConsistent(this.recentlyPlayed, plays)) {
            return {plays: [], consistent: true};
        }

        const recovered = this.tryRecoverUnchangedTopHistory(plays);
        if(recovered !== undefined) {
            return recovered;
        }

        let diffResults: PlayOrderConsistencyResults<PlayOrderChangeType>;
        let diffType: AppleMusicHistoryDiffType | undefined;
        diffResults = playsAreBumpedOnly(this.recentlyPlayed, plays);
        if(diffResults[0] === true) {
            diffType = 'bump';
            if(diffResults[2] !== 'prepend') {
                return {...results, consistent: false, reason: `Previously seen Apple Music history was bumped in an unexpected way (${diffResults[2]}), resetting history to new list`, diffType, diffResults};
            }
            return {...results, plays: [...diffResults[1]!].reverse(), diffType, diffResults};
        } else {
            diffResults = playsAreAddedOnly(this.recentlyPlayed, plays);
            if(diffResults[0] === true) {
                diffType = 'added';
                if(diffResults[2] !== 'prepend') {
                    return {...results, consistent: false, reason: `New tracks were added to Apple Music history in an unexpected way (${diffResults[2]}), resetting watched history to new list`, diffType, diffResults};
                }
                const revertedToRecent = this.recentChangedHistoryResponses.findIndex(x => playsAreSortConsistent(x.plays, plays));
                if(revertedToRecent !== -1) {
                    return {...results, consistent: false, reason: `Apple Music History has exact order as another recent response (${revertedToRecent + 1} ago) which means last history (n - 1) was probably out of date. Resetting history to current list and NOT ADDING new tracks since we probably already discovered them earlier.`, diffType, diffResults};
                }
                return {...results, plays: [...diffResults[1]!].reverse(), diffType, diffResults};
            } else {
                return {...results, consistent: false, reason: 'Apple Music History returned temporally inconsistent order, resetting history to new list.'};
            }
        }
    }

    
    private tryRecoverUnchangedTopHistory = (plays: PlayObject[]): HistoryConsistencyResult | undefined => {
        if(this.config.options?.recoverUnchangedTopHistory === false) {
            return undefined;
        }
        if(this.recentlyPlayed.length === 0 || plays.length === 0) {
            return undefined;
        }

        if(!playsAreSortConsistent([this.recentlyPlayed[0]], [plays[0]])) {
            return undefined;
        }

        const prevTail = this.recentlyPlayed.slice(1);
        const nextTail = plays.slice(1);

        if(playsAreSortConsistent(prevTail, nextTail)) {
            return undefined;
        }

        let tailDiff: PlayOrderConsistencyResults<PlayOrderChangeType> = playsAreBumpedOnly(prevTail, nextTail);
        let tailKind: 'bump' | 'added';

        if(tailDiff[0] === true) {
            if(tailDiff[2] !== 'prepend') {
                return undefined;
            }
            tailKind = 'bump';
        } else {
            tailDiff = playsAreAddedOnly(prevTail, nextTail);
            if(tailDiff[0] !== true || tailDiff[2] !== 'prepend') {
                return undefined;
            }
            const revertedToRecent = this.recentChangedHistoryResponses.findIndex(x => playsAreSortConsistent(x.plays, plays));
            if(revertedToRecent !== -1) {
                return {
                    plays: [],
                    consistent: false,
                    diffType: 'top-rebound',
                    diffResults: tailDiff,
                    reason: `Apple Music History has exact order as another recent response during top-rebound recovery. Resetting history to current list and NOT ADDING tracks.`,
                };
            }
            tailKind = 'added';
        }

        const interimNewestFirst = tailDiff[1] ?? [];
        if(interimNewestFirst.length === 0) {
            return undefined;
        }

        const recoveredPlays = [...interimNewestFirst].reverse().concat(plays[0]);

        this.logger.verbose(
            `Recovered ${interimNewestFirst.length} interim play(s) under unchanged top track (tail ${tailKind}-prepend) and re-scrobbling top as a re-listen (top-rebound).`
        );

        return {
            plays: recoveredPlays,
            consistent: true,
            diffType: 'top-rebound',
            diffResults: tailDiff,
        };
    }
    
    // Apple Music does not provide timestamps for recently played tracks, so hacky method
    private applyCalculatedTimestamps(plays: PlayObject[]): PlayObject[] {
        let durSinceNow = 0;
        const now = dayjs();

        return plays.reduceRight((acc, curr) => {
            const durDatedPlay = {
                data: {
                    ...curr.data,
                    playDate: durSinceNow === 0 ? now : now.subtract(durSinceNow, 'seconds'),
                },
                meta: { ...curr.meta, newFromSource: true }
            }
            durSinceNow += curr.data.duration ?? 1;
            return [durDatedPlay, ...acc];
        }, [] as PlayObject[]);
    }

    parseRecentAgainstResponse = (responsePlays: PlayObject[]): HistoryConsistencyResult => {

        let results: {plays: PlayObject[], consistent: boolean} = {
            plays: [],
            consistent: true
        }

        const plays = responsePlays.slice(0, this.POLL_TRACK_LIMIT);
        if(this.polling === false) {
            results.plays = plays;
            results.plays = results.plays.map((x, index) => ({
                data: {
                    ...x.data,
                    playDate: dayjs().startOf('minute').add(index + 1, 's')
                },
                meta: {
                    ...x.meta,
                    newFromSource: true
                }
            }));
        } else {

            const cResults = this.getIncomingHistoryConsistencyResult(plays);

            const {
                reason,
                plays: newPlays,
                consistent,
                diffResults,
                diffType
            } = cResults;

            results = cResults;

            if(!consistent || (newPlays.length > 0 && this.config.options?.logDiff === true)) {
                const playsDiff = getPlaysDiff(this.recentlyPlayed, plays)
                const humanDiff = humanReadableDiff(this.recentlyPlayed, plays, playsDiff);
                const diffMsg = `Changes from last seen list detected as ${diffType ?? 'unknown'} type:\n${humanDiff}`;
                if(reason !== undefined) {
                    this.logger.warn(reason);
                    this.logger.warn(diffMsg);
                } else {
                    this.logger.verbose(diffMsg);
                }
            }

            results.plays = this.applyCalculatedTimestamps(results.plays);
        }

        this.recentlyPlayed = plays;

        if(results.plays.length > 0) {
            this.recentChangedHistoryResponses = [{plays, ts: dayjs()}, ...this.recentChangedHistoryResponses.slice(0, this.MAX_HISTORY_KEPT)]
        }

        return results;
    }

    onPollPostAuthCheck = async () => {
        if(!this.polling) {
            this.logger.verbose('Hydrating initial recently played tracks for reference.');
            await this.getRecentlyPlayed();
        }
        return true;
    }
}
