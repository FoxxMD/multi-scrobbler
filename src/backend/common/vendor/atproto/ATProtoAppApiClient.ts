import { AbstractApiOptions } from "../../infrastructure/Atomic.js";
import { TealClientData } from "../../infrastructure/config/client/tealfm.js";
import { getATProtoIdentifier } from "./atUtils.js";
import { ATProtoAppData, ATProtoUserIdentifierData } from "../../infrastructure/config/client/atproto.js";
import { ATProtoAuthenticatedApiClient } from "./ATProtoAuthenticatedApiClient.js";
import { PasswordSession, PasswordSessionData } from '@atcute/password-session';
import { Client } from "@atcute/client";
import { UpstreamError } from "../../errors/UpstreamError.js";

export class ATProtoAppApiClient extends ATProtoAuthenticatedApiClient {

    declare config: ATProtoUserIdentifierData & ATProtoAppData;

    constructor(name: any, config: TealClientData, options: AbstractApiOptions) {
        super(name, config, options);
        if (this.config.appPassword === undefined) {
            throw new Error('Must provide app password');
        }
        this.logger.verbose(`Using App Password auth for session`);
    }

    async initClient(): Promise<void> {
        this.userData = await getATProtoIdentifier(this.config, { logger: this.logger, cache: this.cache.cacheAuth });
        this.logger.verbose(`Using ${this.userData.did} on PDS ${this.userData.pds}`);
    }

    restoreSession = async (): Promise<boolean> => {
        const savedSessionCute = await this.getSession();
        if (savedSessionCute !== undefined) {
            const that = this;
            try {
                const session = await PasswordSession.resume(savedSessionCute, {
                    async onUpdate(data) {
                        // called on login and token refresh — persist the session
                        await that.saveSession(data);
                    },
                    async onDelete(data) {
                        // called on logout or session invalidation — clean up
                        await that.deleteSession();
                    },
                });
                this.client = new Client({ handler: session });
            } catch (e) {
                this.logger.warn(new Error('Could not resume app password session from data', { cause: e }));
                return false;
            }
        }
    }

    protected async saveSession(data: PasswordSessionData): Promise<void> {
        await this.cache.cacheAuth.set(`appPwSessionCute-${this.name}-${this.userData.did}`, data, '1000h');
    }

    protected async getSession(): Promise<PasswordSessionData> {
        return await this.cache.cacheAuth.get<PasswordSessionData>(`appPwSessionCute-${this.name}-${this.userData.did}`);
    }

    protected async deleteSession(): Promise<void> {
        await this.cache.cacheAuth.delete(`appPwSessionCute-${this.name}-${this.userData.did}`);
    }

    appLogin = async (): Promise<boolean> => {
        const that = this;
        try {
            const session = await PasswordSession.login(
                { service: this.userData.pds, identifier: this.userData.handle, password: this.config.appPassword },
                {
                    //session: savedSession,
                    async onUpdate(data) {
                        // called on login and token refresh — persist the session
                        await that.saveSession(data);
                    },
                    async onDelete(data) {
                        // called on logout or session invalidation — clean up
                        await that.deleteSession();
                    },
                },
            );

            this.client = new Client({ handler: session });
            return true;
        } catch (e) {
            throw new UpstreamError('Could not login using app password', { cause: e });
        }
    }

}