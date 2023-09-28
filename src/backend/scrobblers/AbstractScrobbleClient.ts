import dayjs, {Dayjs} from "dayjs";
import {
    comparingMultipleArtists,
    isPlayTemporallyClose,
    mergeArr,
    playObjDataMatch,
    setIntersection, sortByOldestPlayDate,
} from "../utils";
import {
    ARTIST_WEIGHT,
    ClientType, DUP_SCORE_THRESHOLD,
    FormatPlayObjectOptions,
    INITIALIZED,
    INITIALIZING,
    InitState,
    NOT_INITIALIZED, REFERENCE_WEIGHT,
    ScrobbledPlayObject, TIME_WEIGHT, TITLE_WEIGHT,
} from "../common/infrastructure/Atomic";
import winston, {Logger} from '@foxxmd/winston';
import { CommonClientConfig } from "../common/infrastructure/config/client/index";
import { ClientConfig } from "../common/infrastructure/config/client/clients";
import { Notifiers } from "../notifier/Notifiers";
import {FixedSizeList} from 'fixed-size-list';
import { PlayObject, TrackStringOptions } from "../../core/Atomic";
import {buildTrackString, capitalize, truncateStringToLength} from "../../core/StringUtils";
import EventEmitter from "events";
import {compareScrobbleArtists, compareScrobbleTracks, normalizeStr} from "../utils/StringUtils";

export default abstract class AbstractScrobbleClient {

    name: string;
    type: ClientType;

    #initState: InitState = NOT_INITIALIZED;

    protected MAX_STORED_SCROBBLES = 40;

    requiresAuth: boolean = false;
    requiresAuthInteraction: boolean = false;
    authed: boolean = false;

    #recentScrobblesList: PlayObject[] = [];
    scrobbledPlayObjs: FixedSizeList<ScrobbledPlayObject>;
    newestScrobbleTime?: Dayjs
    oldestScrobbleTime?: Dayjs
    tracksScrobbled: number = 0;

    lastScrobbleCheck: Dayjs = dayjs(0)
    refreshEnabled: boolean;
    checkExistingScrobbles: boolean;
    verboseOptions;

    config: CommonClientConfig;
    logger: Logger;

    notifier: Notifiers;
    emitter: EventEmitter;

    constructor(type: any, name: any, config: CommonClientConfig, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        this.type = type;
        this.name = name;
        const identifier = `${capitalize(this.type)} - ${name}`;
        this.logger = logger.child({labels: [identifier]}, mergeArr);
        this.notifier = notifier;
        this.emitter = emitter;

        this.scrobbledPlayObjs = new FixedSizeList<ScrobbledPlayObject>(this.MAX_STORED_SCROBBLES);

        const {
            data: {
                options: {
                    refreshEnabled = true,
                    checkExistingScrobbles = true,
                    verbose = {},
                } = {},
            } = {},
        } = config;
        this.config = config;
        this.refreshEnabled = refreshEnabled;
        this.checkExistingScrobbles = checkExistingScrobbles;

        const {
            match: {
                onNoMatch = false,
                onMatch = false,
                confidenceBreakdown = false,
            } = {},
            ...vRest
        } = verbose
        if (onMatch || onNoMatch) {
            this.logger.warn('Setting verbose matching may produce noisy logs! Use with care.');
        }
        this.verboseOptions = {
            ...vRest,
            match: {
                onNoMatch,
                onMatch,
                confidenceBreakdown
            }
        };
    }

    set recentScrobbles(scrobbles: PlayObject[]) {
        const sorted = [...scrobbles];
        sorted.sort(sortByOldestPlayDate);
        this.#recentScrobblesList = sorted;
    }

    get recentScrobbles() {
        return this.#recentScrobblesList;
    }

    get initialized() {
        return this.#initState === INITIALIZED;
    }

   set initialized(val) {
        // @ts-expect-error TS(2367): This condition will always return 'false' since th... Remove this comment to see the full error message
        if(val === INITIALIZING) {
            this.#initState = INITIALIZING;
        // @ts-expect-error TS(2367): This condition will always return 'false' since th... Remove this comment to see the full error message
        } else if(val === true || val === INITIALIZED) {
            this.#initState = INITIALIZED;
        } else {
            this.#initState = NOT_INITIALIZED;
        }
   }

   get initializing() {
        return this.#initState === INITIALIZING;
   }

    // default init function, should be overridden if init stage is required
    initialize = async () => {
        this.initialized = true;
        return true;
    }

    // default init function, should be overridden if auth stage is required
    testAuth = async () => {
        return this.authed;
    }

    isReady = async () => {
        return this.initialized && (!this.requiresAuth || (this.requiresAuth && this.authed));
    }

    refreshScrobbles = async () => {
        this.logger.debug('Scrobbler does not have refresh function implemented!');
    }

    public abstract alreadyScrobbled(playObj: PlayObject, log?: boolean): Promise<boolean>;
    scrobblesLastCheckedAt = () => {
        return this.lastScrobbleCheck;
    }

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => {
        this.logger.warn('formatPlayObj should be defined by concrete class!');
        return obj;
    }

    // time frame is valid as long as the play date for the source track is newer than the oldest play time from the scrobble client
    // ...this is assuming the scrobble client is returning "most recent" scrobbles
    timeFrameIsValid = (playObj: PlayObject) => {

        if(this.oldestScrobbleTime === undefined) {
            return [true, ''];
        }

        const {
            data: {
                playDate,
            } = {},
        } = playObj;
        const validTime = playDate.isAfter(this.oldestScrobbleTime);
        let log = '';
        if (!validTime) {
            const dur = dayjs.duration(Math.abs(playDate.diff(this.oldestScrobbleTime))).humanize(false);
            log = `occurred ${dur} before the oldest scrobble returned by this client (${this.oldestScrobbleTime.format()})`;
        }
        return [validTime, log]
    }

    addScrobbledTrack = (playObj: PlayObject, scrobbledPlay: PlayObject) => {
        this.scrobbledPlayObjs.add({play: playObj, scrobble: scrobbledPlay});
    }

    filterScrobbledTracks = () => {
        this.scrobbledPlayObjs = new FixedSizeList<ScrobbledPlayObject>(this.MAX_STORED_SCROBBLES, this.scrobbledPlayObjs.data.filter(x => this.timeFrameIsValid(x.play)[0])) ;
    }

    getScrobbledPlays = () => {
        return this.scrobbledPlayObjs.data.map(x => x.scrobble);
    }

    cleanSourceSearchTitle = (playObj: PlayObject) => {
        const {
            data: {
                track,
            } = {},
        } = playObj;

        return track.toLocaleLowerCase().trim();
    };

    findExistingSubmittedPlayObj = (playObj: PlayObject): ([undefined, undefined] | [ScrobbledPlayObject, ScrobbledPlayObject[]]) => {
        const {
            data: {
                playDate
            } = {},
            meta: {
                source,
            } = {}
        } = playObj;

        const dtInvariantMatches = this.scrobbledPlayObjs.data.filter(x => playObjDataMatch(playObj, x.play));

        if (dtInvariantMatches.length === 0) {
            return [undefined, undefined];
        }

        const matchPlayDate = dtInvariantMatches.find((x: ScrobbledPlayObject) => {
            const {
                play: {
                    data: {
                        playDate: sPlayDate
                    } = {},
                    meta: {
                        source: playSource
                    } = {},
                } = {},
            } = x;
            // need to account for inaccurate DT from subsonic
            if(source === 'Subsonic' && playSource === 'Subsonic') {
                return playDate.isSame(sPlayDate) || playDate.diff(sPlayDate, 'minute') <= 1;
            }
            return playDate.isSame(sPlayDate);
        });

        return [matchPlayDate, dtInvariantMatches];
    }

    protected compareExistingScrobbleTime = (existing: PlayObject, candidate: PlayObject): [boolean, boolean?] => {
        let closeTime = isPlayTemporallyClose(existing, candidate);
        let fuzzyTime = false;
        if(!closeTime) {
            fuzzyTime = isPlayTemporallyClose(existing, candidate, {fuzzyDuration: true});
        }
        return [closeTime, fuzzyTime];
    }
    protected compareExistingScrobbleTitle = (existing: PlayObject, candidate: PlayObject): number => {
        return Math.min(compareScrobbleTracks(existing, candidate)/100, 1);
    }

    protected compareExistingScrobbleArtist = (existing: PlayObject, candidate: PlayObject): [number, number] => {
        const {
            data: {
                artists: existingArtists = [],
            } = {}
        } = existing;
        const {
            data: {
                artists: candidateArtists = [],
            } = {}
        } = candidate;
        const normExisting = existingArtists.map(x => normalizeStr(x, {keepSingleWhitespace: true}));
        const candidateExisting = candidateArtists.map(x => normalizeStr(x, {keepSingleWhitespace: true}));

        const wholeMatches = setIntersection(new Set(normExisting), new Set(candidateExisting)).size;
        return [Math.min(compareScrobbleArtists(existing, candidate)/100, 1), wholeMatches]
    }

    existingScrobble = async (playObj: PlayObject) => {
        const tr = truncateStringToLength(27);
        const scoreTrackOpts: TrackStringOptions = {include: ['track', 'artist', 'time'], transformers: {track: (t: any, data, existing) => `${existing ? '- ': ''}${tr(t)}`}};

        // return early if we don't care about checking existing
        if (false === this.checkExistingScrobbles) {
            if (this.verboseOptions.match.onNoMatch) {
                this.logger.debug(`(Existing Check) Source: ${buildTrackString(playObj, scoreTrackOpts)} => No Match because existing scrobble check is FALSE`);
            }
            return undefined;
        }

        let existingScrobble;
        let closestMatch: {score: number, breakdowns: string[], confidence: string, scrobble?: PlayObject} = {score: 0, breakdowns: [], confidence: 'None'};

        // then check if we have already recorded this
        const [existingExactSubmitted, existingDataSubmitted = []] = this.findExistingSubmittedPlayObj(playObj);

        // if we have an submitted play with matching data and play date then we can just return the response from the original scrobble
        if (existingExactSubmitted !== undefined) {
            existingScrobble = existingExactSubmitted.scrobble;

            closestMatch = {
                score: 1,
                breakdowns: [],
                confidence: 'Exact Match found in previously successfully scrobbled'
            }
        }
        // if not though then we need to check recent scrobbles from scrobble api.
        // this will be less accurate than checking existing submitted (obv) but will happen if backlogging or on a fresh server start

        if (existingScrobble === undefined) {

            // if no recent scrobbles found then assume we haven't submitted it
            // (either user doesnt want to check history or there is no history to check!)
            if (this.recentScrobbles.length === 0) {
                if (this.verboseOptions.match.onNoMatch) {
                    this.logger.debug(`(Existing Check) ${buildTrackString(playObj, scoreTrackOpts)} => No Match because no recent scrobbles returned from API`);
                }
                return undefined;
            }

            // we have found an existing submission but without an exact date
            // in which case we can check the scrobble api response against recent scrobbles (also from api) for a more accurate comparison
            const referenceApiScrobbleResponse = existingDataSubmitted.length > 0 ? existingDataSubmitted[0].scrobble : undefined;

            existingScrobble = this.recentScrobbles.find((x) => {

                //const referenceMatch = referenceApiScrobbleResponse !== undefined && playObjDataMatch(x, referenceApiScrobbleResponse);


                const [closeTime, fuzzyTime = false] = this.compareExistingScrobbleTime(x, playObj);
                const timeMatch = (closeTime ? 1 : (fuzzyTime ? 0.6 : 0));

                const titleMatch = this.compareExistingScrobbleTitle(x, playObj);

                const [artistMatch, wholeMatches] = this.compareExistingScrobbleArtist(x, playObj);

                let artistScore = ARTIST_WEIGHT * artistMatch;
                const titleScore = TITLE_WEIGHT * titleMatch;
                const timeScore = TIME_WEIGHT * timeMatch;
                //const referenceScore = REFERENCE_WEIGHT * (referenceMatch ? 1 : 0);
                let score = artistScore + titleScore + timeScore;

                let artistWholeMatchBonus = 0;
                let artistBreakdown =  `Artist: ${artistMatch.toFixed(2)} * ${ARTIST_WEIGHT} = ${artistScore.toFixed(2)}`;

                if(score < 1 && timeMatch > 0 && titleMatch > 0.98 && artistMatch > 0.1 && wholeMatches > 0 && comparingMultipleArtists(x, playObj)) {
                    // address scenario where:
                    // * title is very close
                    // * time falls within plausible dup range
                    // * artist is not totally different
                    // * AND score is still not high enough for a dup
                    //
                    // if we detect the plays have multiple artists and we have at least one whole match (stricter comparison than regular score)
                    // then bump artist score a little to see if it gets it over the fence
                    //
                    // EX: Source: The Bongo Hop - Sonora @ 2023-09-28T10:54:06-04:00 => Closest Scrobble: Nidia Gongora / The Bongo Hop - Sonora @ 2023-09-28T10:59:34-04:00 => Score 0.83 => No Match
                    // one play is only returning primary artist, and timestamp is at beginning instead of end of play

                    const scoreBonus = artistMatch * 0.5;
                    const scoreGapBonus = (1 - artistMatch) * 0.75;
                    // use the smallest bump or 0.1
                    artistWholeMatchBonus = Math.max(scoreBonus, scoreGapBonus, 0.1);
                    artistScore = (ARTIST_WEIGHT + 0.05) * (artistMatch + artistWholeMatchBonus);
                    score = artistScore + titleScore + timeScore;
                    artistBreakdown = `Artist: (${artistMatch.toFixed(2)} + Whole Match Bonus ${artistWholeMatchBonus.toFixed(2)}) * (${ARTIST_WEIGHT} + Whole Match Bonus 0.05) = ${artistScore.toFixed(2)}`;
                }

                let scoreBreakdowns = [
                    //`Reference: ${(referenceMatch ? 1 : 0)} * ${REFERENCE_WEIGHT} = ${referenceScore.toFixed(2)}`,
                    artistBreakdown,
                    `Title: ${titleMatch.toFixed(2)} * ${TITLE_WEIGHT} = ${titleScore.toFixed(2)}`,
                    `Time: ${timeMatch} * ${TIME_WEIGHT} = ${timeScore.toFixed(2)}`,
                    `Score ${score.toFixed(2)} => ${score >= DUP_SCORE_THRESHOLD ? 'Matched!' : 'No Match'}`
                ];

                const confidence = `Score ${score.toFixed(2)} => ${score >= DUP_SCORE_THRESHOLD ? 'Matched!' : 'No Match'}`

                const scoreInfo = {
                    score,
                    scrobble: x,
                    confidence,
                    breakdowns: scoreBreakdowns
                }

                if (closestMatch.score <= score && score > 0) {
                    closestMatch = scoreInfo
                }

                return score >= DUP_SCORE_THRESHOLD;
            });
        }

        if ((existingScrobble !== undefined && this.verboseOptions.match.onMatch) || (existingScrobble === undefined && this.verboseOptions.match.onNoMatch)) {
            const closestScrobble = `Closest Scrobble: ${buildTrackString(closestMatch.scrobble, scoreTrackOpts)} => ${closestMatch.confidence}`;
            this.logger.debug(`(Existing Check) Source: ${buildTrackString(playObj, scoreTrackOpts)} => ${closestScrobble}`);
            if (this.verboseOptions.match.confidenceBreakdown === true) {
                this.logger.debug(`Breakdown:
${closestMatch.breakdowns.join('\n')}`);
            }
        }
        return existingScrobble;
    }

    public abstract scrobble(playObj: PlayObject): Promise<boolean>

    public emitEvent = (eventName: string, payload: object) => {
        this.emitter.emit(eventName, {
            data: payload,
            type: this.type,
            name: this.name,
            from: 'client'
        });
    }
}
