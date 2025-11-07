import { AbstractApiOptions } from "../../infrastructure/Atomic.js";
import { TealClientData } from "../../infrastructure/config/client/tealfm.js";
import { Agent, CredentialSession, AtpSessionEvent, AtpSessionData } from "@atproto/api";
import { AbstractBlueSkyApiClient } from "./AbstractBlueSkyApiClient.js";


export class BlueSkyAppApiClient extends AbstractBlueSkyApiClient {

    declare config: TealClientData;

    pds: string
    appSession?: CredentialSession;
    appPwAuth: boolean


    constructor(name: any, config: TealClientData & {pds?: string}, options: AbstractApiOptions) {
        super(name, config, options);
        this.pds = config.pds ?? 'https://bsky.social';
        this.logger.verbose(`Using App Password auth for session with PDS ${this.pds}`);
    }

    protected initClientApp() {
        this.appSession = new CredentialSession(new URL(this.pds), undefined, (evt: AtpSessionEvent, sess?: AtpSessionData) => {
            this.cache.cacheAuth.set(`appPwSession-${this.name}`, sess);
        });
        this.agent = new Agent(this.appSession);
    }

    initClient() {
        this.appSession = new CredentialSession(new URL(this.pds), undefined, (evt: AtpSessionEvent, sess?: AtpSessionData) => {
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
            this.logger.error('Could not login using app password', { cause: e });
            return false;
        }
    }

}