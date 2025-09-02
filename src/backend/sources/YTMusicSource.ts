import dayjs, { Dayjs } from "dayjs";
import EventEmitter from "events";
import { PlayObject } from "../../core/Atomic.js";
import { FormatPlayObjectOptions, InternalConfig } from "../common/infrastructure/Atomic.js";
import { YTMusicSourceConfig } from "../common/infrastructure/config/source/ytmusic.js";
import { Innertube, UniversalCache, Parser, YTNodes, ApiResponse, IBrowseResponse, Log, SessionOptions } from 'youtubei.js';
import { GenerateAuthUrlOpts, OAuth2Client } from 'google-auth-library';
import {resolve} from 'path';
import { formatNumber, isDebugMode, parseBool, sleep } from "../utils.js";
import {
    getPlaysDiff,
    humanReadableDiff,
    PlayOrderChangeType,
    PlayOrderConsistencyResults,
    playsAreAddedOnly,
    playsAreBumpedOnly,
    playsAreSortConsistent
} from "../utils/PlayComparisonUtils.js";
import AbstractSource, { RecentlyPlayedOptions } from "./AbstractSource.js";
import { buildTrackString, truncateStringToLength } from "../../core/StringUtils.js";
import { joinedUrl } from "../utils/NetworkUtils.js";
import { todayAwareFormat } from "../utils/TimeUtils.js";
import { parseArrayFromMaybeString, parseArtistCredits, parseCredits } from "../utils/StringUtils.js";

export interface HistoryIngressResult {
    plays: PlayObject[], 
    consistent: boolean, 
    diffResults?: PlayOrderConsistencyResults<PlayOrderChangeType>, 
    diffType?: 'bump' | 'added', 
    reason?: string
}

export const ytiHistoryResponseToListItems = (res: ApiResponse): YTNodes.MusicResponsiveListItem[] => {
    const page = Parser.parseResponse<IBrowseResponse>(res.data);
    const items = page.contents_memo.getType(YTNodes.MusicResponsiveListItem);
    return Array.from(items);
}

const maybeJsonErrorInfo = (err: Error): object | string | undefined => {
    if('info' in err) {
        try {
            return JSON.parse(err.info as string);
        } catch (e) {
            return err.info as string;
        }
    }
    return undefined;
}

const loggedErrorExtra = (err: Error): object | undefined => {
    const maybeInfo = maybeJsonErrorInfo(err);
    if(maybeInfo === undefined) {
        return undefined;
    }
    if(typeof maybeInfo === 'string') {
        return {apiResponse: maybeInfo};
    }
    return maybeInfo;
}

export const ytiHistoryResponseFromShelfToPlays = (res: ApiResponse, options: {newFromSource?: boolean} = {}): PlayObject[] => {
    const page = Parser.parseResponse<IBrowseResponse>(res.data);
    const items: PlayObject[] = [];
    const shelves = page.contents_memo.getType(YTNodes.MusicShelf);
    shelves.forEach((shelf) => {
        shelf.contents.forEach((listItem) => {
            items.push(YTMusicSource.formatPlayObj(listItem, {shelf: shelf.title.text, newFromSource: options.newFromSource ?? false}));
        });
    });
    return items;
}

const DEFAULT_SCOPES = [
    "http://gdata.youtube.com",
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/youtube-paid-content",
    "https://www.googleapis.com/auth/accounts.reauth",
];

const VALID_SCOPES = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/youtube-paid-content",
]

const getGoogleOauthOpts = (): GenerateAuthUrlOpts => {
    let scopes: string[];
    const userInput = parseArrayFromMaybeString(process.env.YTM_SCOPES);
    if (userInput.length > 0) {
        scopes = userInput.map(x => {
            if (x.toLocaleLowerCase() === 'default') {
                return DEFAULT_SCOPES;
            } else if (x.toLocaleLowerCase() === 'valid') {
                return VALID_SCOPES;
            }
            return x;
        }).flat(1);
    } else {
        scopes = VALID_SCOPES;
    }

    return {
        access_type: 'offline',
        scope: scopes,
        include_granted_scopes: true,
        prompt: 'consent',
    };
}

export default class YTMusicSource extends AbstractSource {

    requiresAuth = true;
    requiresAuthInteraction = true;

    declare config: YTMusicSourceConfig

    recentlyPlayed: PlayObject[] = [];

    yti: Innertube;
    userCode?: string;
    verificationUrl?: string;
    redirectUri?: string;
    oauthClient?: OAuth2Client;

    workingCredsPath: string;

    recentChangedHistoryResponses: {ts: Dayjs, plays: PlayObject[]}[] = [];

    constructor(name: string, config: YTMusicSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('ytmusic', name, config, internal, emitter);
        this.canPoll = true;
        this.supportsUpstreamRecentlyPlayed = true;
        this.workingCredsPath = resolve(this.configDir, `yti-${this.name}`);

        const {
            logDiff,
            ...rest
        } = this.config.options || {};

        let diffVal = logDiff;

        if(diffVal === undefined) {
            const diffEnv = process.env.YTM_LOG_DIFF;
            if(diffEnv !== undefined) {
                diffVal = parseBool(diffEnv);
                this.config.options = {...rest, logDiff: diffVal};
            }
        }
    }

    public additionalApiData(): Record<string, any> {
        const data: Record<string, any> = {};
        if(this.userCode !== undefined) {
            data.userCode = this.userCode;
        }
        return data;
    }

    protected configureYTIEvents() {
            this.yti.session.on('update-credentials', async ({ credentials }) => {
                if(this.config.options?.logAuth) {
                    this.logger.debug(credentials, 'Credentials updated');
                } else {
                    this.logger.debug('Credentials updated');
                }
                await this.yti.session.oauth.cacheCredentials();
            });
            this.yti.session.on('auth-pending', async (data) => {
                if(this.oauthClient === undefined) {
                    this.userCode = data.user_code;
                    this.verificationUrl = data.verification_url;
                }
            });
            this.yti.session.on('auth-error', async (data) => {
                this.logger.error(new Error('YTM Authentication error', {cause: data}));
            });
            this.yti.session.on('auth', async ({ credentials }) => {
                if(this.config.options?.logAuth) {
                    this.logger.debug(credentials, 'Auth success');
                } else {
                    this.logger.debug('Auth success');
                }
                this.userCode = undefined;
                this.authed = true;
                await this.yti.session.oauth.cacheCredentials();
            });
            if(isDebugMode()) {
                Log.setLevel(Log.Level.DEBUG);
            }
    }

    protected configureCustomOauth() {
        this.redirectUri = this.config.data?.redirectUri;
        if(this.redirectUri === undefined) {
            const u = joinedUrl(this.localUrl, 'api/ytmusic/callback');
            u.searchParams.append('name', this.name);
            this.redirectUri = u.toString();
        } else {
            // verify custom URI has required parts
            let u: URL;
            try {
                u = new URL(this.redirectUri);
            } catch(e) {
                throw new Error(`custom redirectUri '${this.redirectUri}' could not be parsed as a URL`, {cause: e});
            }

            if(!u.protocol.includes('http')) {
                throw new Error(`Custom redirectUri '${this.redirectUri}' is missing protocol! Must start with 'http' or 'https'`);
            }
            if(!u.pathname.includes('api')) {
                this.logger.warn(`Custom redirectUri '${this.redirectUri}' does not contain 'api' in path! Unless you know what you are doing with redirects this will likely cause authentication to fail.`);
            }
            if(null === u.pathname.match(/ytmusic\/callback$/)) {
                throw new Error(`Custom redirectUri '${this.redirectUri}' must end in 'ytmusic/callback' before querystring!`);
            }
            if(!u.searchParams.has('name')) {
                throw new Error(`Custom redirectUri '${this.redirectUri}' is missing 'name' in querystring! EX ?name=${this.name}`);
            }
            const nameVal = u.searchParams.get('name');
            if(nameVal !== this.name) {
                throw new Error(`Custom redirectUri '${this.redirectUri}' has wrong value '${nameVal}' for 'name' key in querystring. Must match Source name, case-sensitive -- EX ?name=${this.name}`);
            }
        } 

        this.oauthClient = new OAuth2Client({
            clientId: this.config.data.clientId,
            clientSecret: this.config.data.clientSecret,
            redirectUri: this.redirectUri,
        });

        const scopeOpts = getGoogleOauthOpts();
        this.logger.debug(`Using scopes:\n${(scopeOpts.scope as string[]).join('\n')}`)
        const authorizationUrl = this.oauthClient.generateAuthUrl(getGoogleOauthOpts());
        this.verificationUrl = authorizationUrl;
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            cookie,
            innertubeOptions = {},
        } = this.config.data || {};
        this.yti = await Innertube.create({
            ...(innertubeOptions as SessionOptions),
            cookie,
            cache: new UniversalCache(true, this.workingCredsPath)
        });

        if (this.config.data.clientId !== undefined && this.config.data.clientSecret !== undefined) {
            try {
                this.configureCustomOauth();
            } catch (e) {
                throw new Error('Unable to build custom OAuth Client', { cause: e });
            }
            this.logger.info(`Will use custom OAuth Client:
Client ID     : ${truncateStringToLength(10)(this.config.data.clientId)}
Client Secret : ${truncateStringToLength(10)(this.config.data.clientSecret)}
Redirect URI  : ${this.redirectUri}`);
        } else if (this.config.data.clientId !== undefined || this.config.data.clientSecret !== undefined) {
            const missing = this.config.data.clientId !== undefined ? 'clientSecret' : 'clientId';
            throw new Error(`It looks like you tried to configure a custom OAuth Client but are missing '${missing}'! Cannot build client.`);
        } else if (cookie !== undefined) {
            this.logger.info(`Will use cookie '${truncateStringToLength(10)(cookie)}' for auth`);
        } else {
            this.logger.warn('You have not provided a cookie or custom OAuth client for authorization. MS will use the fallback YoutubeTV auth but this will likely NOT provide access to Youtube Music history!! You should use one of the other methods.');
        }

        this.configureYTIEvents();

        return true;
    }

    reauthenticate = async () => {
        await this.tryStopPolling();
        if(this.authed) {
            await this.clearCredentials();
            this.authed = false;
            await this.testAuth();
        }
    }

    clearCredentials = async () => {
        if(this.yti.session.logged_in) {
            await this.yti.session.signOut();
        }
    }

    async handleAuthCodeCallback(obj: Record<string, any>): Promise<any> {
        if (obj.code === undefined) {
            this.logger.error(`Authorization callback did not contain 'code' in URL`);
            return false;
        }

        const { tokens } = await this.oauthClient.getToken(obj.code as string);

        if (tokens.access_token && tokens.refresh_token && tokens.expiry_date) {
            await this.yti.session.signIn({
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expiry_date: new Date(tokens.expiry_date).toISOString(),
                client: {
                    client_id: this.config.data.clientId,
                    client_secret: this.config.data.clientSecret
                }
            });
            this.authed = true;
            this.verificationUrl = undefined;
            await this.yti.session.oauth.cacheCredentials();
            return true;
        } else {
            this.logger.error(`Token data did not return all required properties.`);
            return tokens;
        }
    }

    doAuthentication = async () => {
        try {
            if (this.config.data.cookie !== undefined) {
                try {
                    await this.yti.account.getInfo()
                    this.authed = true;
                } catch (e) {
                    const info = loggedErrorExtra(e);
                    if (info !== undefined) {
                        this.logger.error(info, 'Additional API response details')
                    }
                    throw new Error('Cookie-based authentication failed. Try recreating cookie or using custom OAuth Client', { cause: e });
                }
            } else {
                await Promise.race([
                    sleep(1000),
                    this.yti.session.signIn()
                ]);
                if (this.authed === false) {

                    if(this.oauthClient !== undefined) {
                        throw new Error(`Sign in using the authentication link on the dashboard or ${this.verificationUrl}`);
                    } else {
                        throw new Error(`Sign in with the code '${this.userCode}' using the authentication link on the dashboard or ${this.verificationUrl}`)
                    }

                }

                try {
                    await this.yti.account.getInfo()
                } catch (e) {
                    const info = loggedErrorExtra(e);
                    if (info !== undefined) {
                        this.logger.error(info, 'Additional API response details')
                    }
                    throw new Error('Credentials exist but API calls are failing. Try re-authenticating?', { cause: e });
                }
            }

            return true;
        } catch (e) {
            throw e;
        }
    }

    static formatPlayObj(obj: YTNodes.MusicResponsiveListItem, options: FormatPlayObjectOptions = {}): PlayObject {
        const {newFromSource = false, shelf = undefined} = options;
        const {
            id,
            title,
            album: albumData,
            artists: artistsData,
            authors: authorData,
            duration: dur, // string timestamp
        } = obj;

        let artists = [],
            album = undefined,
        duration = undefined;
        if(artistsData !== undefined) {
            artists = artistsData.map(x => x.name) as string[];
        } else if(authorData !== undefined) {
            artists = authorData.map(x => x.name) as string[];
        }
        if(artists.length === 0 && obj.flex_columns.at(1)?.title?.text !== undefined) {
            // if YTM doesn't have an endpoint (page) for an artist (combined) then YouTube.js doesn't include it
            // in the music shelf object created from parsing data
            // BUT YouTube.js does expose the raw data so we can try to recover artists from plain text
            // https://github.com/LuanRT/YouTube.js/issues/381
            const credits = parseArtistCredits(obj.flex_columns.at(1)?.title?.text);
            if(credits !== undefined) {
                // try to be clever
                artists.push(credits.primary);
                if(credits.secondary !== undefined) {
                    const nonEmptyArtists = credits.secondary.filter(x => x !== undefined && x !== null && x.trim() !== '');
                    if(nonEmptyArtists.length > 0) {
                        artists = [...artists, ...nonEmptyArtists];
                    }
                }
            } else {
                artists = [obj.flex_columns.at(1)?.title?.text];
            }
        }

        let albumArtists: string[] = [];
        if(artistsData !== undefined && authorData !== undefined) {
            albumArtists = authorData.map(x => x.name) as string[];
        }
        if(albumData !== undefined) {
            album = albumData.name;
        }
        if(album === undefined && obj.flex_columns.at(2)?.title?.text !== undefined) {
            album = obj.flex_columns.at(2)?.title?.text;
        }
        if(dur!== undefined) {
            const durObj = dayjs.duration(dur.seconds, 's')
            duration = durObj.asSeconds();
        }
        return {
            data: {
                artists,
                albumArtists,
                album,
                track: title,
                duration,
                // if object is new from source then we know we've picked it up AFTER we started polling so it can't be older than 1 minute (default polling interval)
                playDate: newFromSource ? dayjs().startOf('minute') : undefined,
            },
            meta: {
                source: 'YTMusic',
                musicService: 'Youtube Music',
                trackId: id,
                newFromSource,
                comment: shelf
            }
        }
    }

    recentlyPlayedTrackIsValid = (playObj: PlayObject) => playObj.meta.newFromSource

    protected getLibraryHistory = async (): Promise<ApiResponse> => {
        // internally for this call YT returns a *list* of playlists with decreasing granularity from most recent to least recent like this:
        // * Today
        // * Yesterday
        // * ....
        // * January 2023
        //
        // the playlist returned can therefore change abruptly IE MS started yesterday and new music listened to today -> "today" playlist is cleared
        try {
            const res = await this.yti.actions.execute('/browse', {
                browse_id: 'FEmusic_history',
                client: 'YTMUSIC'
            });
            return res;
        } catch (e) {
            throw e;
        }
    }

    protected getLibraryHistoryPlaylists = async (): Promise<PlayObject[]> => {
        // internally for this call YT returns a *list* of playlists with decreasing granularity from most recent to least recent like this:
        // * Today
        // * Yesterday
        // * ....
        // * January 2023
        //
        // the playlist returned can therefore change abruptly IE MS started yesterday and new music listened to today -> "today" playlist is cleared
        try {
            const res = await this.getLibraryHistory();
            return ytiHistoryResponseFromShelfToPlays(res);
        } catch (e) {
            const info = loggedErrorExtra(e);
            if(info !== undefined) {
                this.logger.error(info, 'Additional API response details')
            }
            throw e;
        }
    }

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
       return (await this.getLibraryHistoryPlaylists()).slice(0, 100);
    }

    /**
     * Get the last 20 recently played tracks
     * */
    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        const { display = false } = options;

        let playlistDetail: ApiResponse;
        try {
            playlistDetail = await this.getLibraryHistory();
        } catch (e) {
            throw e;
        }

        const listPlays = ytiHistoryResponseFromShelfToPlays(playlistDetail);
        
        return this.parseRecentAgainstResponse(listPlays).plays;
        
    }

    getIncomingHistoryConsistencyResult = (plays: PlayObject[]): HistoryIngressResult => {
        const results: HistoryIngressResult = {
            plays: [],
            consistent: true
        }
        
        if(playsAreSortConsistent(this.recentlyPlayed, plays)) {
            return {plays: [], consistent: true};
        }

        let warnMsg: string;
        let diffResults: PlayOrderConsistencyResults<PlayOrderChangeType>;
        let diffType: 'bump' | 'added';
        diffResults = playsAreBumpedOnly(this.recentlyPlayed, plays);
        if(diffResults[0] === true) {
            results.diffType = 'bump';
            if(diffResults[2] !== 'prepend') {
                results.consistent = false;
                results.reason = `(Bump Plays Detected) Previously seen YTM history was bumped in an unexpected way (${diffResults[2]}), resetting history to new list`;
            } else {
                results.plays = [...diffResults[1]].reverse();
            }
        } else {
            diffResults = playsAreAddedOnly(this.recentlyPlayed, plays);
            if(diffResults[0] === true) {
                results.diffType = 'added';
                if(diffResults[2] !== 'prepend') {
                    results.consistent = false;
                    results.reason = `(Add Plays Detected) New tracks were added to YTM history in an unexpected way (${diffResults[2]}), resetting watched history to new list`;
                } else {
                    const revertedToRecent = this.recentChangedHistoryResponses.findIndex(x => playsAreSortConsistent(x.plays, plays));
                    if(revertedToRecent !== -1) {
                        results.consistent = false;
                        results.reason = `(Add Plays Detected) YTM History has exact order as another recent response *where history was changed* (${revertedToRecent + 1} ago @ ${todayAwareFormat(this.recentChangedHistoryResponses[revertedToRecent].ts)}) which means last history (n - 1) was probably out of date. Resetting history to current list and NOT ADDING new tracks since we probably already discovered them earlier.`
                    } else {
                        results.plays = [...diffResults[1]].reverse();
                    }
                }
            } else {
                results.consistent = false;
                results.reason = 'YTM History returned temporally inconsistent order, resetting history to new list.';
            }
        }
        results.diffResults = diffResults;

        return results;
    }

    parseRecentAgainstResponse = (responsePlays: PlayObject[]): HistoryIngressResult => {

        //let newPlays: PlayObject[] = [];
        let results: HistoryIngressResult = {
            plays: [],
            consistent: true
        }

        const plays = responsePlays.slice(0, 20);
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

            if(consistent && newPlays.length > 1) {
                const interimPlays = newPlays.slice(0, newPlays.length - 1);
                // check enough time has passed since last discovery
                const discovered = this.getFlatRecentlyDiscoveredPlays();
                if(discovered.length > 0) {
                    const lastDiscovered = discovered[0].data.playDate;
                    // the assumption in behavior is that user skips 1 or more tracks which then get recorded to YTM history
                    // eventually, they land on a track they want to listen to which is the current (newest) track in history
                    // -- so check duration from newest to oldest and subtract time since last discovered, *ignoring* the newest track since that is the one being played
                    const reversed = [...interimPlays].reverse();
                    let timeRemaining = dayjs().diff(lastDiscovered, 'second');
                    const durationValidTracks: PlayObject[] = [];
                    const durationLog: string[] = [];
                    for(const play of reversed) {
                        const shortIdentifier = buildTrackString(play, {include: ['track']});
                        if(play.data.duration === undefined) {
                            // allow any tracks without duration, i guess?
                            durationValidTracks.push(play);
                            durationLog.push(`${shortIdentifier} => no duration, will allow`)
                            continue;
                        }
                        if(timeRemaining <= 0) {
                            durationLog.push(`${shortIdentifier} => Not enough time remaining!`);
                            continue;
                        }
                        const newRemaining = timeRemaining - (play.data.duration * 0.5);
                        if(newRemaining > 0) {
                            durationValidTracks.push(play);
                            durationLog.push(`${shortIdentifier} (50% of ${play.data.duration}s) => OK! ${timeRemaining} - ${formatNumber(play.data.duration * 0.5, {toFixed: 0})} = ${newRemaining}s remaining since last discovery`)
                        } else {
                            durationLog.push(`${shortIdentifier} (50% of ${play.data.duration}s) => Not OK! ${timeRemaining} - ${formatNumber(play.data.duration * 0.5, {toFixed: 0})} = ${newRemaining}s remaining since last discovery`);
                        }
                        timeRemaining = newRemaining;
                    }
                    this.logger.verbose(`More than one track found, using time since last discovered track (${dayjs().diff(lastDiscovered, 'second')}s) as guidepost for if n+1 earlier tracks could have passed 50% duration listened. Results:
${durationLog.join('\n')}`);
                    if(durationValidTracks.length === 0) {
                        results.plays = [results.plays[results.plays.length - 1]]
                    } else {
                        const correctOrder = [...durationValidTracks].reverse();
                        results.plays = [...correctOrder, results.plays[results.plays.length - 1]];
                    }
                } else {
                    this.logger.verbose('No existing tracks discovered, could not determine if enough time has passed to reasonably scrobble new tracks.');
                }
            }

            if(!consistent || (newPlays.length > 0 && (this.config.options?.logDiff === true || isDebugMode()))) {
                const playsDiff = getPlaysDiff(this.recentlyPlayed, plays)
                const humanDiff = humanReadableDiff(this.recentlyPlayed, plays, playsDiff);
                const diffMsg = `Changes from last seen list detected as ${diffType} type:
${humanDiff}`;
                if(reason !== undefined) {
                    this.logger.warn(reason);
                    this.logger.warn(diffMsg);
                } else {
                    this.logger.verbose(diffMsg);
                }
            }
            let durSinceNow = 0;
            const now = dayjs();

            const rrPlays = results.plays.reduceRight((acc, curr) => {
                const durDatedPlay = {
                    data: {
                        ...curr.data,
                        playDate: durSinceNow === 0 ? now : now.subtract(durSinceNow, 'seconds'),
                    },
                    meta: {
                        ...curr.meta,
                        newFromSource: true
                    }
                }
                durSinceNow += curr.data.duration ?? 1;
                return [durDatedPlay, ...acc];
            }, []);

            results.plays = rrPlays
        }

        this.recentlyPlayed = plays;

        if(results.plays.length > 0) {
            this.recentChangedHistoryResponses = [{plays, ts: dayjs()}, ...this.recentChangedHistoryResponses.slice(0, 3)]
        }

        return results;
    }

    onPollPostAuthCheck = async () => {
        if(!this.polling) {
            this.logger.verbose('Hydrating initial recently played tracks for reference.');
            const referencePlays = await this.getRecentlyPlayed();
            const reversedPlays = [...referencePlays];
            // actual order they were discovered in (oldest to newest)
            reversedPlays.reverse();
            if(this.getFlatRecentlyDiscoveredPlays().length === 0) {
                // and add to discovered since its empty
                for(const refPlay of reversedPlays) {
                    this.addPlayToDiscovered(refPlay);
                }
            }
        }
        return true;
    }
}
