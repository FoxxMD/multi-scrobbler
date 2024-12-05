import dayjs from "dayjs";
import EventEmitter from "events";
import { PlayObject } from "../../core/Atomic.js";
import { FormatPlayObjectOptions, InternalConfig } from "../common/infrastructure/Atomic.js";
import { YTMusicSourceConfig } from "../common/infrastructure/config/source/ytmusic.js";
import { Innertube, UniversalCache, Parser, YTNodes, ApiResponse, IBrowseResponse, Log, SessionOptions } from 'youtubei.js';
import { OAuth2Client } from 'google-auth-library';
import {resolve} from 'path';
import { joinedUrl, sleep } from "../utils.js";
import {
    getPlaysDiff,
    humanReadableDiff,
    playsAreAddedOnly,
    playsAreBumpedOnly,
    playsAreSortConsistent
} from "../utils/PlayComparisonUtils.js";
import AbstractSource, { RecentlyPlayedOptions } from "./AbstractSource.js";

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

export const ytiHistoryResponseFromShelfToPlays = (res: ApiResponse): PlayObject[] => {
    const page = Parser.parseResponse<IBrowseResponse>(res.data);
    const items: PlayObject[] = [];
    const shelves = page.contents_memo.getType(YTNodes.MusicShelf);
    shelves.forEach((shelf) => {
        shelf.contents.forEach((listItem) => {
            items.push(YTMusicSource.formatPlayObj(listItem, {shelf: shelf.title.text}));
        });
    });
    return items;
}

export default class YTMusicSource extends AbstractSource {

    requiresAuth = true;
    requiresAuthInteraction = true;

    cookieBased: boolean = false;

    declare config: YTMusicSourceConfig

    recentlyPlayed: PlayObject[] = [];

    yti: Innertube;
    userCode?: string;
    verificationUrl?: string;
    oauthClient?: OAuth2Client;

    workingCredsPath: string;

    constructor(name: string, config: YTMusicSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('ytmusic', name, config, internal, emitter);
        this.canPoll = true;
        Log.setLevel(Log.Level.ERROR);
        this.cookieBased = this.config.data?.cookie !== undefined;
        this.supportsUpstreamRecentlyPlayed = true;
        this.workingCredsPath = resolve(this.configDir, `yti-${this.name}`);
    }

    public additionalApiData(): Record<string, any> {
        const data: Record<string, any> = {};
        if(this.userCode !== undefined) {
            data.userCode = this.userCode;
        }
        return data;
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
        this.yti.session.on('update-credentials', async ({ credentials }) => {
            if(this.config.options?.logAuth) {
                this.logger.debug(credentials, 'Credentials updated');
            } else {
                this.logger.debug('Credentials updated');
            }
            await this.yti.session.oauth.cacheCredentials();
        });
        this.yti.session.on('auth-pending', async (data) => {
            this.userCode = data.user_code;
            this.verificationUrl = data.verification_url;
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
            this.verificationUrl = undefined;
            this.authed = true;
            await this.yti.session.oauth.cacheCredentials();
            const f =1;
        });
        return true;
    }

    reauthenticate = async () => {
        await this.tryStopPolling();
        await this.clearCredentials();
        this.authed = false;
        await this.testAuth();
    }

    clearCredentials = async () => {
        if(this.yti.session.logged_in && !this.cookieBased) {
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
            this.userCode = undefined;
            await this.yti.session.oauth.cacheCredentials();
            Log.setLevel(Log.Level.ERROR);
            return true;
        } else {
            this.logger.error(`Token data did not return all required properties.`);
            return tokens;
        }
    }

    doAuthentication = async () => {
        try {
            if (this.cookieBased) {
                try {
                    await this.yti.account.getInfo()
                    this.authed = true;
                } catch (e) {
                    const info = loggedErrorExtra(e);
                    if (info !== undefined) {
                        this.logger.error(info, 'Additional API response details')
                    }
                    this.logger.error(new Error('Cookie-based authentication failed. Try recreating cookie or using custom OAuth Client', { cause: e }));
                }
            }

            await Promise.race([
                sleep(1000),
                this.yti.session.signIn()
            ]);
            if (this.authed === false) {

                if (this.config.data.clientId !== undefined) {
                    let redirectUri = this.config.data?.redirectUri;
                    if(redirectUri === undefined) {
                        const u = joinedUrl(this.localUrl, 'api/ytmusic/callback');
                        u.searchParams.append('name', this.name);
                        redirectUri = u.toString();
                    } 

                    this.logger.info(`Using Custom OAuth Client with Redirect URI: ${redirectUri}`);
                    this.oauthClient = new OAuth2Client({
                        clientId: this.config.data.clientId,
                        clientSecret: this.config.data.clientSecret,
                        redirectUri
                    });

                    const authorizationUrl = this.oauthClient.generateAuthUrl({
                        access_type: 'offline',
                        scope: [
                            "http://gdata.youtube.com",
                            "https://www.googleapis.com/auth/youtube",
                            "https://www.googleapis.com/auth/youtube.force-ssl",
                            "https://www.googleapis.com/auth/youtube-paid-content",
                            "https://www.googleapis.com/auth/accounts.reauth",
                        ],
                        include_granted_scopes: true,
                        prompt: 'consent',
                    });

                    this.verificationUrl = authorizationUrl;
                    this.userCode = undefined;
                    throw new Error(`Sign in using ${authorizationUrl}`);
                } else {
                    if (this.userCode !== undefined) {
                        this.logger.warn('Logging in with YoutubeTV Oauth will likely NOT provide access to Youtube Music history!! You should try to use either cookies or a custom OAuth Client ID/Secret');
                        throw new Error(`Sign in with the code '${this.userCode}' using the authentication link on the dashboard or ${this.verificationUrl}`)
                    } else {
                        throw new Error('Waited too long for auth response from YTM!');
                    }
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
            Log.setLevel(Log.Level.ERROR);
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

        let albumArtists: string[] = [];
        if(artistsData !== undefined && authorData !== undefined) {
            albumArtists = authorData.map(x => x.name) as string[];
        }
        if(albumData !== undefined) {
            album = albumData.name;
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

        let newPlays: PlayObject[] = [];

        const page = Parser.parseResponse<IBrowseResponse>(playlistDetail.data);
        const shelfPlays = ytiHistoryResponseFromShelfToPlays(playlistDetail);
        const listPlays = ytiHistoryResponseToListItems(playlistDetail).map((x) => YTMusicSource.formatPlayObj(x, {newFromSource: false}));
        const plays = listPlays.slice(0, 20);
        if(this.polling === false) {
            this.recentlyPlayed = plays;
            newPlays = plays;
        } else {
            if(playsAreSortConsistent(this.recentlyPlayed, plays)) {
                return newPlays;
            }

            let warnMsg: string;
            const bumpResults = playsAreBumpedOnly(this.recentlyPlayed, plays);
            if(bumpResults[0] === true) {
                newPlays = bumpResults[1];
            } else {
                const addResults = playsAreAddedOnly(this.recentlyPlayed, plays);
                if(addResults[0] === true) {
                    newPlays = [...addResults[1]].reverse();
                } else {
                    warnMsg = 'YTM History returned temporally inconsistent order, resetting watched history to new list.';
                }
            }

            if(warnMsg !== undefined || (newPlays.length > 0 && this.config.options?.logDiff === true)) {
                const playsDiff = getPlaysDiff(this.recentlyPlayed, plays)
                const humanDiff = humanReadableDiff(this.recentlyPlayed, plays, playsDiff);
                const diffMsg = `Changes from last seen list:
    ${humanDiff}`;
                if(warnMsg !== undefined) {
                    this.logger.warn(warnMsg);
                    this.logger.warn(diffMsg);
                } else {
                    this.logger.debug(diffMsg);
                }
            }

            this.recentlyPlayed = plays;

                newPlays = newPlays.map((x, index) => ({
                    data: {
                        ...x.data,
                        playDate: dayjs().startOf('minute').add(index + 1, 's')
                    },
                    meta: {
                        ...x.meta,
                        newFromSource: true
                    }
                }));
        }

        return newPlays;
        
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
