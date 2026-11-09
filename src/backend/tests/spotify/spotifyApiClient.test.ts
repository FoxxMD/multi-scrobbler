import { loggerTest } from '@foxxmd/logging';
import { Cacheable } from 'cacheable';
import { expect } from 'chai';
import { beforeEach, describe, it } from 'mocha';
import { nameToCredit } from '../../../core/MusicMetadata.ts';
import { SpotifyApiClient } from '../../common/vendor/spotify/SpotifyApiClient.ts';

describe('Spotify API Client', function () {

    let client: SpotifyApiClient;
    let calls: Record<string, any[]>;

    beforeEach(function () {
        calls = {};
        client = new SpotifyApiClient('test', { clientId: 'id', clientSecret: 'secret' }, {
            logger: loggerTest,
            cache: new Cacheable()
        });
        const record = (name: string, body: object) => async (q: string, opts: any) => {
            calls[name] = [q, opts];
            return { body };
        };
        (client as any).spotifyApi = {
            getAccessToken: () => 'token',
            setAccessToken: () => undefined,
            clientCredentialsGrant: async () => ({ body: { access_token: 'token', expires_in: 3600 } }),
            searchTracks: record('searchTracks', { tracks: { items: [] } }),
            searchArtists: record('searchArtists', { artists: { items: [] } }),
            searchAlbums: record('searchAlbums', { albums: { items: [] } }),
        };
        (client as any).tokenExpiresAt = Date.now() + 3600 * 1000;
    });

    it('sends locale and market when searching tracks by ISRC', async function () {
        await client.searchTracksByIsrc('US-RC1-76-07839', { market: 'US', locale: 'en_US' });
        expect(calls.searchTracks[1]).to.include({ market: 'US', locale: 'en_US' });
    });

    it('sends locale and market when searching tracks by fields', async function () {
        await client.searchTracksByFields({ data: { track: nameToCredit('My Track'), artists: [nameToCredit('My Artist')] }, meta: {} } as any, { market: 'US', locale: 'en_US' });
        expect(calls.searchTracks[1]).to.include({ market: 'US', locale: 'en_US' });
    });

    it('sends locale when searching artists', async function () {
        await client.searchArtists(nameToCredit('My Artist'), { locale: 'en_US' });
        expect(calls.searchArtists[1]).to.include({ locale: 'en_US' });
    });

    it('sends locale when searching albums', async function () {
        await client.searchAlbums({ album: nameToCredit('My Album') }, { locale: 'en_US' });
        expect(calls.searchAlbums[1]).to.include({ locale: 'en_US' });
    });

    it('omits locale from the request when it is not set', async function () {
        await client.searchTracksByIsrc('USRC17607839', { market: 'US' });
        expect(calls.searchTracks[1]).to.not.have.property('locale');
    });
});
