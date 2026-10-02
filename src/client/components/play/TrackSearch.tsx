import { useListCollection, Stack, Text, HStack } from "@chakra-ui/react"
import { useDebouncedState } from '@tanstack/react-pacer'
import { useQuery } from '@tanstack/react-query';
import { tanQueries } from "../../queries/index.js";
import type { TrackSearchResult } from "../../../core/Api.js";
import { MusicbrainzInfoIcon, type MusicbrainzInfoIconProps } from "../musicServices/Musicbrainz.js";
import React, { useEffect } from "react";
import { ArtistCreditTags } from "../ArtistCreditDisplay.js";
import { LeftSideMetadataResultContent, MetadataPickMenu, MetadataSearchCombobox, type MetadataPartials } from "./MetadataResults.js";

const trackPartials: MetadataPartials<TrackSearchResult> = {
    track: { label: 'Track only', pick: ({ artists, album, albumCount, ...rest }) => rest },
    artists: { label: 'Track + artists', pick: ({ album, albumCount, ...rest }) => rest },
    album: { label: 'Track + album', pick: ({ artists, ...rest }) => rest },
};

export const TrackSearchResultItem = (props: { data: TrackSearchResult, onPick?: (val: TrackSearchResult) => void }) => {

    const { onPick } = props;

    const {
        album,
        albumCount,
        name,
        mbidRecording,
        mbidTrack,
        artists = []
    } = props.data;

    let mbidType: MusicbrainzInfoIconProps['type'] | undefined = undefined;
    let mbid: string | undefined = undefined;
    if (mbidRecording !== undefined) {
        mbidType = 'recording';
        mbid = mbidRecording;
    } else if (mbidTrack !== undefined) {
        mbidType = 'track';
        mbid = mbidTrack;
    }

    let albumContent: React.JSX.Element | undefined = undefined;
    if (album !== undefined) {
        const andCount = albumCount !== undefined && albumCount > 1 ? (
            <Text color="fg.subtle" textStyle="sm">
                and {albumCount} more...
            </Text>
        ) : undefined;
        albumContent = (<Text color="fg.muted" textStyle="sm">
            <HStack>
                {album.name} {album.type !== undefined ? `(${album.type})` : ''} {andCount}
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
                        {name} {mbid !== undefined && mbidType !== undefined ? <MusicbrainzInfoIcon type={mbidType} mbid={mbid} tooltip /> : null} <MetadataPickMenu data={props.data} partials={trackPartials} onPick={onPick} />
                    </HStack>
                </Text>
                {artistTags}
                {albumContent}
            </Stack>
        </HStack>
    )
}

export interface TrackSearchProps {
    initial?: string
    onChange: (val: TrackSearchResult) => void
}

export const TrackSearch = (props: TrackSearchProps) => {

    const {
        initial = '',
        onChange = (val) => console.log(val, 'Selected value for prop')
    } = props;

    const [debouncedQuery, setDebouncedQuery] = useDebouncedState<string>(initial, { wait: 500 });

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

    return (
        <MetadataSearchCombobox
            placeholder="Type to search for tracks"
            collection={collection}
            isLoading={query.isLoading}
            isError={query.isError}
            onChange={onChange}
            onQueryChange={setDebouncedQuery}
            renderItem={(item, onPick) => <TrackSearchResultItem data={item} onPick={onPick} />}
        />
    );
}