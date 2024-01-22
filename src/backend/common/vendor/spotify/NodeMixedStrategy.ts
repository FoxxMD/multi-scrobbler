/*
import {AccessToken, AuthorizationCodeWithPKCEStrategy, ICachable, emptyAccessToken} from "@spotify/web-api-ts-sdk";
import AccessTokenHelpers from "@spotify/web-api-ts-sdk/src/auth/AccessTokenHelpers.js";

interface CachedVerifier extends ICachable {
    verifier: string;
    expiresOnAccess: boolean;
}

export class NodeMixedStrategy extends AuthorizationCodeWithPKCEStrategy {

    protected static readonly cacheKey = "spotify-sdk:NodeMixedStrategy:token";

    public async generateAuthorizationUrl() {
        const verifier = AccessTokenHelpers.generateCodeVerifier(128);
        const challenge = await AccessTokenHelpers.generateCodeChallenge(verifier);

        const singleUseVerifier: CachedVerifier = { verifier, expiresOnAccess: true };
        this.cache.setCacheItem("spotify-sdk:verifier", singleUseVerifier);

        return await this.generateRedirectUrlForUser(this.scopes, challenge);
    }

    public async getOrCreateAccessToken(code?: string): Promise<AccessToken> {
        const token = await this.cache.getOrCreate<AccessToken>(
            NodeMixedStrategy.cacheKey,
            async () => {
                const token = await this.redirectOrVerifyToken(code);
                return AccessTokenHelpers.toCachable(token);
            }, async (expiring) => {
                return AccessTokenHelpers.refreshCachedAccessToken(this.clientId, expiring);
            },
        );

        return token;
    }

    protected async redirectOrVerifyToken(code?: string): Promise<AccessToken> {
        if (code) {
            const token = await this.verifyAndExchangeCode(code);
            return token;
        }
        return emptyAccessToken; // Redirected away at this point, just make TypeScript happy :)
    }

    protected async verifyAndExchangeCode(code: string) {
        const cachedItem = await this.cache.get<CachedVerifier>("spotify-sdk:verifier");
        const verifier = cachedItem?.verifier;

        if (!verifier) {
            throw new Error("No verifier found in cache - can't validate query string callback parameters.");
        }
        return await this.exchangeCodeForToken(code, verifier!);
    }
}
*/
