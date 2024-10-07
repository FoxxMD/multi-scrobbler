import dayjs from "dayjs";
import EventEmitter from "events";
import YouTubeMusic from "youtube-music-ts-api";
import { IYouTubeMusicAuthenticated } from "youtube-music-ts-api/interfaces-primary";
import { IPlaylistDetail, ITrackDetail } from "youtube-music-ts-api/interfaces-supplementary";
import { PlayObject } from "../../core/Atomic.js";
import { FormatPlayObjectOptions, InternalConfig } from "../common/infrastructure/Atomic.js";
import { YTMusicCredentials, YTMusicSourceConfig } from "../common/infrastructure/config/source/ytmusic.js";
import { parseDurationFromTimestamp, readJson, writeFile } from "../utils.js";
import {
    getPlaysDiff,
    humanReadableDiff,
    playsAreAddedOnly,
    playsAreSortConsistent
} from "../utils/PlayComparisonUtils.js";
import AbstractSource, { RecentlyPlayedOptions } from "./AbstractSource.js";

export default class YTMusicSource extends AbstractSource {
    apiInstance?: IYouTubeMusicAuthenticated

    requiresAuth = true;

    declare config: YTMusicSourceConfig

    recentlyPlayed: PlayObject[] = [];

    workingCredsPath: string;
    currentCreds!: YTMusicCredentials;

    constructor(name: string, config: YTMusicSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('ytmusic', name, config, internal, emitter);
        this.canPoll = true;
        this.supportsUpstreamRecentlyPlayed = true;
        this.workingCredsPath = `${this.configDir}/currentAuth-ytm-${name}.json`;
    }

    protected writeCurrentAuth = async (cookie: string, authUser: number) => {
        await writeFile(this.workingCredsPath, JSON.stringify({
            cookie,
            authUser
        }));
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        let creds: YTMusicCredentials;
        try {
            creds = await readJson(this.workingCredsPath, {throwOnNotFound: false}) as YTMusicCredentials;
            if(creds !== undefined) {
                this.currentCreds = creds;
                return `Read updated credentials from file currentAuth-ytm-${this.name}.json`;
            }
        } catch (e) {
            this.logger.warn('Current YTMusic credentials file exists but could not be parsed', { path: this.workingCredsPath });
        }
        if(creds === undefined) {
            if(this.config.data.cookie === undefined) {
                throw new Error('No YTM cookies were found in configuration');
            }
            this.currentCreds = this.config.data;
            return 'Read initial credentials from config';
        }
    }

    doAuthentication = async () => {
        try {
            await this.getRecentlyPlayed();
            return true;
        } catch (e) {
            if(e.message.includes('Status code: 401')) {
                let hint = 'Verify your cookie and authUser are correct.';
                if(this.currentCreds.authUser === undefined) {
                    hint = `${hint} TIP: 'authUser' is not defined your credentials. If you are using Chrome to retrieve credentials from music.youtube.com make sure the value from the 'X-Goog-AuthUser' is used as 'authUser'.`;
                }
                this.logger.error(`Authentication failed with the given credentials. ${hint} | Error => ${e.message}`);
            }
            throw e;
        }
    }

    static formatPlayObj(obj: ITrackDetail, options: FormatPlayObjectOptions = {}): PlayObject {
        const {newFromSource = false} = options;
        const {
            id,
            title,
            album: albumData,
            artists: artistsData,
            duration: durTimestamp, // string timestamp
        } = obj;

        let artists = undefined,
            album = undefined,
        duration = undefined;
        if(artistsData !== undefined) {
            artists = artistsData.map(x => x.name) as string[];
        }
        let albumArtists: string[] = [];
        if(albumData !== undefined) {
            album = albumData.name;
            if(albumData.artist !== undefined) {
                albumArtists = [albumData.artist.name];
            }
        }
        if(durTimestamp !== undefined) {
            const durObj = parseDurationFromTimestamp(durTimestamp);
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
            }
        }
    }

    recentlyPlayedTrackIsValid = (playObj: PlayObject) => playObj.meta.newFromSource

    protected onAuthUpdate = (cookieStr: string, authUser: number, updated: Map<string, {new: string, old: string}>) => {
        const {
            options: {
                logAuthUpdateChanges = false
            } = {}
        } = this.config;

        if(logAuthUpdateChanges) {
            const parts: string[] = [];
            if(authUser !== this.currentCreds.authUser) {
                parts.push(`X-Goog-Authuser: ${authUser}`);
            }
            for(const [k,v] of updated) {
                parts.push(`Cookie ${k}: Old => ${v.old} | New => ${v.new}`);
            }
            this.logger.info(`Updated Auth -->\n${parts.join('\n')}`);
        } else {
            this.logger.verbose(`Updated Auth`);
        }

        this.currentCreds = {
            cookie: cookieStr,
            authUser
        };


        this.writeCurrentAuth(cookieStr, authUser).then(() => {});
    }

    api = async (): Promise<IYouTubeMusicAuthenticated> => {
        if(this.apiInstance !== undefined) {
            return this.apiInstance;
        }
        // @ts-expect-error default does exist
        const ytm = new  YouTubeMusic.default() as YouTubeMusic;
        try {
            this.apiInstance = await ytm.authenticate(this.currentCreds.cookie, typeof this.config.data.authUser === 'string' ? Number.parseInt(this.config.data.authUser) : this.config.data.authUser, this.onAuthUpdate);
        } catch (e: any) {
            this.logger.error('Failed to authenticate', e);
            throw e;
        }
        return this.apiInstance;
    }

    protected getLibraryHistory = async (): Promise<IPlaylistDetail> => {
        // internally for this call YT returns a *list* of playlists with decreasing granularity from most recent to least recent like this:
        // * Today
        // * Yesterday
        // * ....
        // * January 2023
        //
        // the playlist returned can therefore change abruptly IE MS started yesterday and new music listened to today -> "today" playlist is cleared
        try {
            const playlist = await (await this.api()).getLibraryHistory();
            return {tracks: [], ...playlist};
        } catch (e) {
            throw e;
        }
    }

    protected getLibraryHistoryPlaylists = async (): Promise<IPlaylistDetail[]> => {
        // internally for this call YT returns a *list* of playlists with decreasing granularity from most recent to least recent like this:
        // * Today
        // * Yesterday
        // * ....
        // * January 2023
        //
        // the playlist returned can therefore change abruptly IE MS started yesterday and new music listened to today -> "today" playlist is cleared
        try {
            return await (await this.api()).getLibraryHistory(true) as IPlaylistDetail[];
        } catch (e) {
            throw e;
        }
    }

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        let playlists: IPlaylistDetail[];
        try {
            playlists = await this.getLibraryHistoryPlaylists()
        } catch (e) {
            throw e;
        }
        const playlistAwareTracks: PlayObject[][] = [];

        for(const playlist of playlists) {
            playlistAwareTracks.push(playlist.tracks.map((x) => YTMusicSource.formatPlayObj(x, {newFromSource: false})).map((x) => ({...x,meta: {...x.meta, comment: playlist.name}})))
        }

       return playlistAwareTracks.flat(1).slice(0, 100);
    }

    /**
     * Get the last 20 recently played tracks
     * */
    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        const { display = false } = options;

        let playlistDetail: IPlaylistDetail;
        try {
            playlistDetail = await this.getLibraryHistory();
        } catch (e) {
            throw e;
        }

        let newPlays: PlayObject[] = [];

        const plays = playlistDetail.tracks.map((x) => YTMusicSource.formatPlayObj(x, {newFromSource: false})).slice(0, 20);
        if(this.polling === false) {
            this.recentlyPlayed = plays;
            newPlays = plays;
        } else {
            if(playsAreSortConsistent(this.recentlyPlayed, plays)) {
                return newPlays;
            }
            const [ok, diff, addType] = playsAreAddedOnly(this.recentlyPlayed, plays);
            if(!ok || addType === 'insert' || addType === 'append') {
                const playsDiff = getPlaysDiff(this.recentlyPlayed, plays)
                const humanDiff = humanReadableDiff(this.recentlyPlayed, plays, playsDiff);
                this.logger.warn('YTM History returned temporally inconsistent order, resetting watched history to new list.');
                this.logger.warn(`Changes from last seen list:
${humanDiff}`);
                this.recentlyPlayed = plays;
                return newPlays;
            } else {
                // new plays
                newPlays = [...diff].reverse();
                this.recentlyPlayed = plays;

                newPlays = newPlays.map((x) => ({
                    data: {
                        ...x.data,
                        playDate: dayjs().startOf('minute')
                    },
                    meta: {
                        ...x.meta,
                        newFromSource: true
                    }
                }));
            }
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
