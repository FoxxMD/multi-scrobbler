import { AbstractApiOptions } from "../../infrastructure/Atomic.js";
import { TealClientData } from "../../infrastructure/config/client/tealfm.js";
import { Agent, CredentialSession, AtpSessionEvent, AtpSessionData } from "@atproto/api";
import { AbstractBlueSkyApiClient } from "./AbstractBlueSkyApiClient.js";
import { isPortReachableConnect, normalizeWebAddress } from "../../../utils/NetworkUtils.js";
import { URLData } from "../../../../core/Atomic.js";
import { isNodeNetworkException } from "../../errors/NodeErrors.js";


export class BlueSkyAppApiClient extends AbstractBlueSkyApiClient {

    declare config: TealClientData;

    pds: URLData
    appSession?: CredentialSession;
    appPwAuth: boolean


    constructor(name: any, config: TealClientData & {pds?: string}, options: AbstractApiOptions) {
        super(name, config, options);
        
        this.pds = normalizeWebAddress(config.pds ?? 'https://bsky.social');
        this.logger.verbose(`Using App Password auth for session with PDS ${this.pds.url}`);
    }

    protected initClientApp() {
        this.appSession = new CredentialSession(this.pds.url, undefined, (evt: AtpSessionEvent, sess?: AtpSessionData) => {
            this.cache.cacheAuth.set(`appPwSession-${this.name}`, sess);
        });
        this.agent = new Agent(this.appSession);
    }

    initClient() {
        this.appSession = new CredentialSession(this.pds.url, undefined, (evt: AtpSessionEvent, sess?: AtpSessionData) => {
            this.cache.cacheAuth.set(`appPwSession-${this.name}`, sess);
        });
        this.agent = new Agent(this.appSession);
    }

    restoreSession = async (): Promise<boolean> => {
        const savedSession = await this.cache.cacheAuth.get<AtpSessionData>(`appPwSession-${this.name}`);
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

    async checkPds(): Promise<true> {
        try {
            await isPortReachableConnect(this.pds.port, {host: this.pds.url.hostname});
            return true;
        } catch (e) {
            if(isNodeNetworkException(e)) {
                throw new Error('Could not communicate with PDS server', {cause: e});
            }
            throw new Error('Unexpected error when trying to communicate with PDS server', {cause: e});
        }
    }

}