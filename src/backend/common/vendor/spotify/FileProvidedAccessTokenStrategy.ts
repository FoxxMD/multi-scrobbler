import {AccessToken, ProvidedAccessTokenStrategy} from '@fostertheweb/spotify-web-sdk';

export class FileProvidedAccessTokenStrategy extends ProvidedAccessTokenStrategy {

    protected oldAccessToken?: AccessToken;
    protected onTokenRefreshed?: (data: AccessToken) => Promise<void>
    constructor(
        clientId: string,
        accessToken: AccessToken,
        refreshTokenAction?: (data: AccessToken) => Promise<void>
    ) {
        super(clientId, accessToken);
        this.oldAccessToken = accessToken;
        this.onTokenRefreshed = refreshTokenAction;
    }

    public async getOrCreateAccessToken(): Promise<AccessToken> {
        const data = await super.getOrCreateAccessToken();
        if(this.onTokenRefreshed !== undefined) {
            for(const [k,v] of Object.entries(data)) {
                if(this.oldAccessToken[k] !== v) {
                    await this.onTokenRefreshed(data);
                    break;
                }
            }
        }
        return data;
    }
}
