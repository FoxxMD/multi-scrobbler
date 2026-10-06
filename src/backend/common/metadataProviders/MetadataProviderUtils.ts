import type { AlbumSearchResult, ArtistSearchResult, TrackSearchResult } from "../../../core/Api.ts";
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