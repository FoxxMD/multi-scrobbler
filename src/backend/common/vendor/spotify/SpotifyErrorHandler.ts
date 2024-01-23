import {IValidateResponses, ICachingStrategy, InMemoryCachingStrategy} from '@fostertheweb/spotify-web-sdk';
import {UpstreamError} from "../../errors/UpstreamError.js";

export class MSSpotifyResponseValidator implements IValidateResponses {
    public async validateResponse(response: Response): Promise<void> {

        switch (response.status) {
            case 401:
                throw new UpstreamError("Spotify API => Bad or expired token. This can happen if the user revoked a token or the access token has expired. Please re-authenticate through the dashboard.", {response, showStopper: true});
            case 403:
                const body = await response.text();
                throw new UpstreamError(`"Spotify API => Bad OAuth request (wrong consumer key, bad nonce, expired timestamp...). Please delete any existing credentials file, check your spotify config, and re-authenticate. Body: ${body}`, {response, showStopper: true});
            case 429:
                throw new UpstreamError("Spotify API => The app has exceeded its rate limits.", {response, showStopper: true});
            default:
                if (!response.status.toString().startsWith('20')) {
                    const body = await response.text();
                    throw new UpstreamError(`Spotify API => NOT-OK response code: ${response.status} - ${response.statusText} Body: ${body}`, {response, showStopper: response.status === 400});
                }
        }

    }
}
