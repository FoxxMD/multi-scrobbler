import MemorySource from "./MemorySource";
import {AppleMusicSourceConfig} from "../common/infrastructure/config/source/apple";
import {InternalConfig} from "../common/infrastructure/Atomic";
import EventEmitter from "events";
import {readJson, readText, writeFile} from "../utils";
import MusicKit from 'node-musickit-api/personalized/index.js';
import {createJWT} from 'node-musickit-api/modules/createJWT.js';


export class AppleSource extends MemorySource {
    requiresAuth = true;
    requiresAuthInteraction = true;
    canPoll = true;

    declare config: AppleMusicSourceConfig;

    workingCredsPath: string;

    keyContents?: string
    userToken?: string

    apiClient: MusicKit;

    constructor(name: any, config: AppleMusicSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('apple', name, config, internal, emitter);

        this.workingCredsPath = `${internal.configDir}/currentCreds-apple-${name}.json`;
    }

    initialize = async () => {
        if (this.config.data.key !== undefined || this.config.data.teamId !== undefined || this.config.data.keyId !== undefined) {
            if (this.config.data.key === undefined) {
                this.logger.error(`For apple source as SERVER the property 'key' must be defined`);
                this.initialized = false;
                return false;
            } else {
                // try to parse as file
                try {
                    this.keyContents = await readText(this.config.data.key, {throwOnNotFound: false})
                    if (this.keyContents === undefined) {
                        // could not find as file, that's fine
                        this.keyContents = this.config.data.key;
                    }
                } catch (e) {
                    this.logger.error(`Apple config 'key' property seems to be a valid file path but could not be read: ${e.message}`);
                    this.initialized = false;
                    return false;
                }
            }
            if (this.config.data.teamId === undefined) {
                this.logger.error(`For apple source as SERVER the property 'teamId' must be defined`);
                this.initialized = false;
                return false;
            }
            if (this.config.data.keyId === undefined) {
                this.logger.error(`For apple source as SERVER the property 'keyId' must be defined`);
                this.initialized = false;
                return false;
            }
        }

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
                })
            }
        } catch (e) {
            this.logger.warn('Current apple credentials file exists but could not be parsed', {path: this.workingCredsPath});
            this.initialized = false;
            return false;
        }

        this.initialized = true;
        return true;
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
