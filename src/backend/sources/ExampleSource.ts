import type { EventEmitter } from "events";
import request from 'superagent';
import type {PlayObject, PlayObjectMinimal, URLData} from "../../core/Atomic.ts";
import {
    type FormatPlayObjectOptions,
    type InternalConfig,
    type PlayerStateData,
} from "../common/infrastructure/Atomic.ts";
import { PARSED_FROM, SINGLE_USER_PLATFORM_ID } from '../../core/Atomic.ts';
import { REPORTED_PLAYER_STATUSES } from '../../core/Atomic.ts';
import { isPortReachable, normalizeWebAddress } from "../utils/NetworkUtils.ts";
import type {RecentlyPlayedOptions} from "./AbstractSource.ts";
import { baseFormatPlayObj } from "../utils/PlayTransformUtils.ts";
import { artistNamesToCredits } from "../../core/StringUtils.ts";
import { AuthError } from "../common/errors/MSErrors.ts";
import MemorySource from "./MemorySource.ts";
import type { CoolPlayerSourceConfig } from "../common/infrastructure/config/source/example.ts";
import { UpstreamError } from "../common/errors/UpstreamError.ts";

export class CoolPlayerSource extends MemorySource {
    // must explicitly declare this here so we override the base config type
    declare config: CoolPlayerSourceConfig;

    // this source actively makes requests to an external service to parse
    // lits listening state
    override canPoll: boolean = true;
    // this source requires a form of authentication to pass before it is considered ready
    override requiresAuth: boolean = true;
    // the form of auth does not require user interact (like an oauth flow)
    // all required auth data comes from config
    override requiresAuthInteraction: boolean = false;

    protected urlData!: URLData;


    constructor(name: any, config: CoolPlayerSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        // the aio `type` literal is used here
        // @ts-expect-error this type is not included in actual repository since it is just an example. Remove if using this for real implementation
        super('coolplayer', name, config, internal, emitter);
    }

    /**
     * A stage of the Init process
     * 
     * If you need to modify/transform any config data
     * or further validation of config data (outside of zod) is required then do it here
     */
    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                baseUrl,
            } = {}
        } = this.config;

        if(!baseUrl!.includes('/api')) {
            this.logger.warn('Cool Player connections usually have an /api prefix but none was detected!');
            // may also want to throw here instead if this is show stopping:
            // throw new Error(`Cool Player connections require an /api prefix but none was detected. Given: ${baseUrl}`);
        }
        this.urlData = normalizeWebAddress(baseUrl!);
        // if everything is ok then return true
        return true;
    }

    /**
     * A stage of the Init process
     * 
     * Perform any initial NON-AUTH connection check here.
     * 
     * Useful for determining if connectivity is possible at all without needing to isolate if response issues are due to auth. 
     */
    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            await isPortReachable(this.urlData.port, {host: this.urlData.url.host});
            return `${this.urlData.url.host}:${this.urlData.port} is reachable.`;
        } catch (e) {
            throw e;
        }
    }

    /**
     * A stage of the Init process
     * 
     * Perform the simplest request possible to determine if the auth data given in user config is valid
     */
    doAuthentication = async () => {

        try {
            // if a simple call with user token returns a 200 then auth is ok
            request.get(this.urlData.url).set('Authorization', `Bearer ${this.config.data.token}`);
            return true;
        } catch (e) {
            // error is unrecoverable when unauthorized response cannot be fixed without changing config
            // or some external service (like Cool Player itself)
            throw new AuthError(`Could not connect to Cool Player server`, {cause: e, unrecoverable: true});
        }
    }

    /**
     * Used to transform the Source-specific data structure for scrobble/play/history data into a generic, known MS data structure called a Play
     */
    formatPlayObj(obj: CoolPlayerStateResponse, options: FormatPlayObjectOptions = {}): PlayObject {

        const play: PlayObjectMinimal = {
            // data includes all of the essential properties for scrobbling
            // plus a `meta` object for metaservice ids like musicbrainz MBIDs or spotify track id
            data: {
                artists: artistNamesToCredits(obj.data.track_artists),
                album: obj.data.track_album,
                track: obj.data.track_name,
                duration: obj.data.length,
            },
            // meta is data that is optional or used only for MS processing
            // like device id, unique track id (for comparing duplicates), album art, etc...
            meta: {
                // this is the only "essential" property that you need to include in meta
                // if this Source is a history or ingress based Source this need to be set to be set appropriately
                //
                //parsedFrom: PARSED_FROM.history
            }
        }
        // obj passed here sets the "original data" a Play is built from
        // this is accessible/rendered to the user in the UI for debugging
        return baseFormatPlayObj(obj, play);
    }

    /**
     * Called when MS is polling the associated Source for activity
     * 
     * This function is responsible for fetching activity from the Source, parsing it into an MS Play,
     * and returning that Play and/or PlayerStateData
     * 
     * MS then determines if this is actionable/scrobbable based on the state and what type of Source this is
     */
    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {

        let responseData: CoolPlayerStateResponse;
        try {
            const resp = await request.get(`${this.urlData.url.toString()}/player`)
            .set('Authorization', `Bearer ${this.config.data.token}`);
            responseData = resp.body as CoolPlayerStateResponse;
        } catch (e) {
            // upstream errors are useful for logging and letting MS determine if an error was caused by code or some network issue outside its control
            throw new UpstreamError('Failed to get player state response', {cause: e});
        }

        const play: PlayObject = this.formatPlayObj(responseData);

        // PlayerStateData contains more than just the Play needed for scrobbling
        // it also contains the data needed for MS to determine if the Source's player is in a state that can be monitored
        const playerState: PlayerStateData = {
            platformId: SINGLE_USER_PLATFORM_ID,
            status: responseData.player_state === 'playing' ? REPORTED_PLAYER_STATUSES.playing : REPORTED_PLAYER_STATUSES.paused,
            play
        }

        return await this.processRecentPlays([playerState]);
    }

}

/**
 * If request/response interaction requires more than 1-2 interfaces
 * or api calls require complex authentication or error handling for responses
 * 
 * then it is better to move these interfaces/types *and* request logic into separate files in
 * /src/backend/common/vendor
 * like `CoolPlayerApiClient.ts` and/or `CoolPlayerApiTypes.ts`
 */
interface CoolPlayerStateResponse {
    player_state: string
    data: {
        track_name: string
        track_artists: string[]
        track_album: string,
        length: number
    }
}