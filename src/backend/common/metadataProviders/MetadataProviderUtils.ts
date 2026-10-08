import type { AlbumSearchResult, ArtistSearchResult, MetadataResultServiceScore, TrackSearchResult } from "../../../core/Api.ts";
import type { Credit, TrackData } from "../../../core/Atomic.ts";
import type { ErrorIsh } from "../../../core/ErrorUtils.ts";

export interface MetadataProvider {
    getTrackResults: (query: string) => Promise<TrackSearchResult[] | false>
    getArtistResults: (query: string) => Promise<ArtistSearchResult[] | false>
    getAlbumResults: (query: string) => Promise<AlbumSearchResult[] | false>
}

export interface AggregateMetadataResponse<T extends (TrackSearchResult | ArtistSearchResult | AlbumSearchResult)> {
    data: T[]
    errors: {service: string, error: ErrorIsh}[]
}

export const asMetadataProvider = (val: object): val is MetadataProvider => 
    `getTrackResults` in val && typeof val.getTrackResults === 'function'
    && `getArtistResults` in val && typeof val.getArtistResults === 'function'
    && `getAlbumResults` in val && typeof val.getAlbumResults === 'function'

/** A Credit as a result nested in another result: found on the same service as its parent and identified by the first service id it has, or its name if it has none */
export const creditToResult = (credit: Credit, service: string): ArtistSearchResult => ({
    ...credit,
    service,
    id: credit.metadata?.[0]?.id ?? credit.name
});

/** Build a track result from TrackData, nesting its artists and album as results from the same service */
export const trackDataToResult = (
    data: TrackData,
    result: Pick<TrackSearchResult, 'id' | 'service' | 'score' | 'albumCount'>,
    album: Omit<Partial<AlbumSearchResult>, keyof ArtistSearchResult> & Partial<Pick<MetadataResultServiceScore, 'score'>> = {}
): TrackSearchResult => ({
    ...data,
    ...result,
    artists: data.artists?.map(x => creditToResult(x, result.service)),
    albumArtists: data.albumArtists?.map(x => creditToResult(x, result.service)),
    album: data.album === undefined ? undefined : { ...creditToResult(data.album, result.service), ...album }
});
