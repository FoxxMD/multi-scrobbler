import { useListCollection, Stack, Text, HStack } from "@chakra-ui/react"
import { useDebouncedState } from '@tanstack/react-pacer'
import { useQuery } from '@tanstack/react-query';
import { tanQueries } from "../../queries/index.js";
import type { TrackSearchResult } from "../../../core/Api.js";
import React, { useCallback, useEffect, useState } from "react";
import { ArtistCreditTags } from "../ArtistCreditDisplay.js";
import { LeftSideMetadataResultContent, MetadataPickMenu, MetadataSearchCombobox, type MetadataPartials } from "./MetadataResults.js";
import { type ArtMeta, type PlayObjectMinimal } from "../../../core/Atomic.js";
import { removeUndefinedKeys } from "../../../core/DataUtils.js";
import { MusicServiceIndicators } from "../musicServices/MusicServiceIndicators.js";
import { albumSearchResultToMusicServices } from "./AlbumSearch.js";
import type { MusicServicesAny } from '../../../core/MusicMetadata.js';

const trackPartials: MetadataPartials<TrackSearchResult> = {
    track: { label: 'Track only', pick: ({ artists, album, albumCount, ...rest }) => rest },
    artists: { label: 'Track + artists', pick: ({ album, albumCount, ...rest }) => rest },
    album: { label: 'Track + album', pick: ({ artists, ...rest }) => rest },
};

export const trackSearchResultToMusicServices = (val: MinimalResult): MusicServicesAny[] => {
    const musicServices: MusicServicesAny[] = [];
    if (val.mbidTrack) {
        musicServices.push({ name: 'musicbrainz', id: val.mbidTrack, idHint: 'track' });
    } else if (val.mbidRecording) {
        musicServices.push({ name: 'musicbrainz', id: val.mbidRecording, idHint: 'recording' });
    }
    if(val.spotifyId !== undefined) {
        musicServices.push({ name: 'spotify', id: val.spotifyId, idType: 'track' });
    }
    return musicServices;
}

export const TrackSearchResultItem = (props: { data: TrackSearchResult, onPick?: (val: TrackSearchResult) => void }) => {

    const { onPick } = props;

    const {
        album,
        albumCount,
        name,
        artists = []
    } = props.data;

    let albumContent: React.JSX.Element | undefined = undefined;
    if (album !== undefined) {
        const andCount = albumCount !== undefined && albumCount > 1 ? (
            <Text color="fg.subtle" textStyle="sm">
                and {albumCount} more...
            </Text>
        ) : undefined;
        albumContent = (<Text color="fg.muted" textStyle="sm">
            <HStack>
                {album.name} {album.type !== undefined ? `(${album.type})` : ''}<MusicServiceIndicators services={albumSearchResultToMusicServices(album)}/> {andCount}
            </HStack>
        </Text>)
    }

    let artistTags: React.JSX.Element | undefined = undefined;
    if (artists.length > 0) {
        artistTags = <ArtistCreditTags data={artists} />
    }

    return (
        <HStack gap="4" flexGrow="1">
            <LeftSideMetadataResultContent {...props.data} />
            <Stack gap="1" flexGrow="1">
                <Text fontWeight="medium" mb="1">
                    <HStack>
                        {name} <MusicServiceIndicators services={trackSearchResultToMusicServices(props.data)}/> <MetadataPickMenu data={props.data} partials={trackPartials} onPick={onPick} />
                    </HStack>
                </Text>
                {artistTags}
                {albumContent}
            </Stack>
        </HStack>
    )
}

type MinimalResult = Pick<TrackSearchResult, 'name' | 'mbidTrack' | 'mbidRecording' | 'spotifyId'>
export interface TrackSearchProps {
    initial?: PlayObjectMinimal<string>
    onChange: (val: PlayObjectMinimal<string>) => void
}

const trackResultToPlay = (val: TrackSearchResult): PlayObjectMinimal<string> => {
    const {
        name,
        mbidTrack,
        mbidRecording,
        spotifyId,
        artists,
        album,
        image
    } = val;

    const play = removeUndefinedKeys<PlayObjectMinimal<string>>({
        data: {
            track: name,
            artists: artists !== undefined && artists.length > 0 ? artists.map((x) => ({name: x.name, mbid: x.mbid, spotifyId: x.spotifyId})) : undefined,
            album: album?.name,
            meta: removeUndefinedKeys({
                brainz: removeUndefinedKeys({
                    track: mbidTrack,
                    recording: mbidRecording,
                    album: album?.mbidRelease,
                    releaseGroup: album?.mbidReleaseGroup
                }),
                spotify: removeUndefinedKeys({
                    track: spotifyId
                })
            })
        },
        meta: {}
    }, false);

    const art = removeUndefinedKeys<ArtMeta>({
        album: album?.image,
        track: image,
        artist: (artists ?? []).find(x => x.image !== undefined)?.image
    });
    if(art !== undefined) {
        play.meta = {
            art
        }
    }

    return play;
}

export const TrackSearch = (props: TrackSearchProps) => {

    const {
        initial,
        onChange = (val) => console.log(val, 'Selected value for prop')
    } = props;

    const {
        data: {
            track,
            meta: {
                brainz: {
                    recording,
                    track: mbidTrack
                } = {},
                spotify: {
                    track: spotifyId
                } = {}
            } = {}
        } = {},
    } = initial ?? {};

    const [selectedItem, setSelectedItem] = useState<MinimalResult>(removeUndefinedKeys({
        name: track ?? '',
        mbidTrack,
        mbidRecording: recording,
        spotifyId
    }, false));
    const [debouncedQuery, setDebouncedQuery] = useDebouncedState<string>(track ?? '', { wait: 500 });

    const query = useQuery({
        enabled: debouncedQuery !== '',
        ...tanQueries.metadata.track(debouncedQuery)
    });

    const { collection, set } = useListCollection<TrackSearchResult>({
        initialItems: query.data?.data ?? [],
        itemToString: (item) => item.name,
        itemToValue: (item) => item.id,
    });

    useEffect(() => {
        if (query.isSuccess) {
            set(query.data.data);
        }
    }, [query, set])

    const doChange = useCallback((val: TrackSearchResult) => {
        setSelectedItem(val);
        onChange(trackResultToPlay(val));
    },[setSelectedItem, onChange]);

    const services = trackSearchResultToMusicServices(selectedItem);
    let groupContent: React.JSX.Element | undefined = undefined;
    if(services.length > 0) {
        groupContent = <MusicServiceIndicators services={services} link={false}/>
    }

    return (
        <MetadataSearchCombobox
            placeholder="Type to search for tracks"
            collection={collection}
            inputGroupContent={groupContent}
            isLoading={query.isLoading}
            isError={query.isError}
            initialInput={selectedItem?.name}
            onChange={doChange}
            onQueryChange={setDebouncedQuery}
            renderItem={(item, onPick) => <TrackSearchResultItem data={item} onPick={onPick} />}
        />
    );
}