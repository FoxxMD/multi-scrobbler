import { useEffect, useRef, useState, useCallback } from 'react'
import {AccessToken, AuthorizationCodeWithPKCEStrategy, SdkOptions, SpotifyApi} from "@spotify/web-api-ts-sdk";

const scopes = ['user-read-recently-played', 'user-read-currently-playing', 'user-read-playback-state', 'user-read-playback-position'];

export function useSpotify(key: number, name: string, clientId: string, redirectUrl: string, scopes: string[], config?: SdkOptions) {

    const [accessTokenData, setAccessTokenData] = useState<AccessToken | null>(null);
    const [sdk, setSdk] = useState<SpotifyApi | null>(null);
    const { current: activeScopes } = useRef(scopes);

    useEffect(() => {
        const hashParams = new URLSearchParams(window.location.search);
        const code = hashParams.get("code");
        if(key === 0 && code === null) {
            return;
        }
        if(clientId === undefined || redirectUrl === undefined) {
            return;
        }
        (async () => {
            const auth = new AuthorizationCodeWithPKCEStrategy(clientId, redirectUrl, activeScopes);
            const internalSdk = new SpotifyApi(auth, config);

            try {
                const resp = await internalSdk.authenticate();

                if (resp.authenticated) {
                    await fetch(`/api/source/auth`, {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json'
                        },
                        body: {
                            type: 'spotify',
                            // @ts-ignore
                            name: name,
                            data: resp.accessToken
                        }
                    });
                    setSdk(() => internalSdk);
                }
            } catch (e: Error | unknown) {

                const error = e as Error;
                if (error && error.message && error.message.includes("No verifier found in cache")) {
                    console.error("If you are seeing this error in a React Development Environment it's because React calls useEffect twice. Using the Spotify SDK performs a token exchange that is only valid once, so React re-rendering this component will result in a second, failed authentication. This will not impact your production applications (or anything running outside of Strict Mode - which is designed for debugging components).", error);
                } else {
                    console.error(e);
                }
            }

        })();
    }, [clientId, redirectUrl, config, activeScopes, key]);

    return [sdk, accessTokenData];
}

export const SpotifyAuthLink = (props: SpotifyAuthLinkProps) => {
    const {clientId, redirectUri, name} = props || {};
    const [clickCounter, setClickCounter] = useState(0);

    useSpotify(clickCounter, name, clientId, redirectUri, scopes);

    const onClick = useCallback(() => {
        setClickCounter(clickCounter + 1);
    },[setClickCounter, clickCounter]);

    return <a href="#" onClick={onClick}>(Re)authenticate</a>;
}

export interface SpotifyAuthLinkProps {
    clientId: string
    redirectUri: string
    name: string
}
