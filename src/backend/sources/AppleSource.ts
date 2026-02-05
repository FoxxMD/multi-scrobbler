import AbstractSource, { RecentlyPlayedOptions } from "./AbstractSource.js";
import {AppleMusicSourceConfig} from "../common/infrastructure/config/source/apple.js";
import {FormatPlayObjectOptions, InternalConfig} from "../common/infrastructure/Atomic.js";
import EventEmitter from "events";
import {parseBool, readText, writeFile} from "../utils.js";
import MusicKit from 'node-musickit-api/personalized/index.js';
import {createJWT} from 'node-musickit-api/modules/createJWT.js';
import { readJson } from "../utils/DataUtils.js";
import {resolve} from 'path';
import { PlayObject, PlayObjectLifecycleless } from "../../core/Atomic.js";
import dayjs from "dayjs";
import { baseFormatPlayObj } from "../utils/PlayTransformUtils.js";


export class AppleSource extends AbstractSource {
    requiresAuth = true;
    requiresAuthInteraction = true;

    declare config: AppleMusicSourceConfig;

    recentlyPlayed: PlayObject[] = [];

    workingCredsPath: string;

    keyContents?: string
    userToken?: string

    apiClient: MusicKit;

    constructor(name: any, config: AppleMusicSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('apple', name, config, internal, emitter);

        this.canPoll = true;
        this.supportsUpstreamRecentlyPlayed = true;

        this.workingCredsPath = resolve(this.configDir, `apple-${this.name}.json`);

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

    protected async doBuildInitData(): Promise<true | string | undefined> {
        if (this.config.data.key !== undefined || this.config.data.teamId !== undefined || this.config.data.keyId !== undefined) {
            if (this.config.data.key === undefined) {
                throw new Error(`For apple source as SERVER the property 'key' must be defined`);
            } else {
                // try to parse as file
                try {
                    this.keyContents = await readText(this.config.data.key, {throwOnNotFound: false})
                    if (this.keyContents === undefined) {
                        // could not find as file, that's fine
                        this.keyContents = this.config.data.key;
                    }
                } catch (e) {
                    throw new Error(`Apple config 'key' property seems to be a valid file path but could not be read: ${e.message}`);
                }
            }
            if (this.config.data.teamId === undefined) {
                throw new Error(`For apple source as SERVER the property 'teamId' must be defined`);
            }
            if (this.config.data.keyId === undefined) {
                throw new Error(`For apple source as SERVER the property 'keyId' must be defined`);
            }
        }

        return true;
    }

    doAuthentication = async () => {
        try {
            const credFile = await readJson(this.workingCredsPath, {throwOnNotFound: false});
            if(credFile !== undefined) {
                this.userToken = credFile.userToken;
                // temp
                this.apiClient = new MusicKit({
                    key: this.keyContents,
                    teamId: this.config.data.teamId,
                    keyId: this.config.data.keyId,
                    userToken: this.userToken,
                });
                return true;
            } else {
                throw new Error('No user token has been written yet, Authenticate from the dashboard to complete setup.');
            }
        } catch (e) {
            throw new Error('Current apple credentials file exists but could not be parsed');
        }
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {

        // https://musickit.js.org/#/personalized/recentlyPlayed?id=get-recently-played-tracks
        const songs = this.apiClient.getRecentlyPlayed(options.limit ?? 20, 0, "songs");

        // TODO fully implement formatPlayObj
        const rawPlays = songs.map(x => formatPlayObj(x));

        /**
         * TODO implement comparing latest list of plays against previously seen/processed plays
         * 
         * See YTMusicSource@parseRecentAgainstResponse -- this is going to be basically the same process
         * because both YTMusic and Apple do not return timestamps of when tracks were played
         * so we do a state-machine-esque comparison of tracks we *know* we have already seen
         * and then "discover" tracks that appear in the latest list that weren't in the previous list,
         * with their timestamp set to an approximation of when polling for the latest list happened
         * 
         * It might be better to refactor the YTMusic parseRecentAgainstResponse etc. functions into indepedent functions that can be re-used by both sources
         */

        throw new Error('Not implemented');
    }

    generateDeveloperToken = () => {
        return createJWT({
            key: this.keyContents,
            teamId: this.config.data.teamId,
            keyId: this.config.data.keyId,
        });
    }

    handleAuthCodeCallback = async ({token}) => {
        await writeFile(this.workingCredsPath, JSON.stringify({
            userToken: token
        }));
        this.userToken = token;
        this.logger.info('Got apple user music token callback!');
        // temp
        this.apiClient = new MusicKit({
            key: this.keyContents,
            teamId: this.config.data.teamId,
            keyId: this.config.data.keyId,
            userToken: this.userToken,
        })
        return true;
    }
}

export const formatPlayObj = (obj: object, options: FormatPlayObjectOptions = {}): PlayObjectLifecycleless => {
    // node-musickit-api does not have typings
    // need to make an interface from response reference here https://developer.apple.com/documentation/applemusicapi/get-v1-me-recent-played-tracks

    const {newFromSource = false} = options;

    const play: PlayObjectLifecycleless = {
        data: {
            // if object is new from source then we know we've picked it up AFTER we started polling so it can't be older than 1 minute (default polling interval)
            playDate: newFromSource ? dayjs().startOf('minute') : undefined,
        },
        meta: {

        }
    }

    throw new Error('Not implemented yet');
    return baseFormatPlayObj(obj, play);
}