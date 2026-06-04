import { AbstractApiOptions } from "../../infrastructure/Atomic.js";
import { TealClientData } from "../../infrastructure/config/client/tealfm.js";
import { Agent, CredentialSession, AtpSessionEvent, AtpSessionData } from "@atproto/api";
import { AbstractATProtoApiClient } from "./AbstractATProtoApiClient.js";
import { getATProtoIdentifier, identifierToAtProtoHandle, isDID } from "./atUtils.js";
import { ATProtoAppData, ATProtoUserIdentifierData } from "../../infrastructure/config/client/atproto.js";

export class ATProtoAppApiClient extends AbstractATProtoApiClient {

    declare config: ATProtoUserIdentifierData & ATProtoAppData;
    appSession?: CredentialSession;
    appPwAuth: boolean


    constructor(name: any, config: TealClientData, options: AbstractApiOptions) {
        super(name, config, options);
        this.logger.verbose(`Using App Password auth for session`);
        const cleanIdentifier = this.config.identifier;
        if(isDID(cleanIdentifier)) {
            this.logger.debug(`Identifier ${cleanIdentifier} looks like a DID, skipping parsing as a handle.`);
            this.config.did = cleanIdentifier;
        } else {
            this.config.identifier = identifierToAtProtoHandle(this.config.identifier, {logger: this.logger, defaultDomain: 'bsky.social'});
        }
        if(this.config.appPassword === undefined) {
            throw new Error('Must provide app password');
        }
    }

    async initClient(): Promise<void> {
        const hd = await getATProtoIdentifier(this.config, {logger: this.logger, cache: this.cache.cacheAuth});
        this.logger.verbose(`Using ${hd.did} on PDS ${hd.pds}`);
        this.appSession = new CredentialSession(new URL(hd.pds), undefined, (evt: AtpSessionEvent, sess?: AtpSessionData) => {
            this.cache.cacheAuth.set(`appPwSession-${this.name}-${hd.did}`, sess, '1000h');
        });
        this.agent = new Agent(this.appSession);
    }

    restoreSession = async (): Promise<boolean> => {
        const hd = await getATProtoIdentifier(this.config, {logger: this.logger, cache: this.cache.cacheAuth});
        const savedSession = await this.cache.cacheAuth.get<AtpSessionData>(`appPwSession-${this.name}-${hd.did}`);
        if (savedSession !== undefined) {
            try {
                this.logger.debug('Found existing session, trying to resume...');
                await this.appSession.resumeSession(savedSession);
                this.logger.debug('Resumed session!');
                return true;
            } catch (e) {
                this.logger.warn(new Error('Could not resume app password session from data', { cause: e }));
                return false;
            }
        }
        this.logger.debug('No app password session data to restore');
    }

    appLogin = async (): Promise<boolean> => {
        try {

            const f = await this.appSession.login({
                identifier: this.config.identifier,
                password: this.config.appPassword
            });
            if (!f.success) {
                this.logger.error('Login was not successful with app password');
                return false;
            }
            this.logger.debug('Logged in.');
            return true;
        } catch (e) {
            this.logger.error(new Error('Could not login using app password', { cause: e }));
            return false;
        }
    }

}