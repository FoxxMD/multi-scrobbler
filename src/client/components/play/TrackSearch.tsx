import { useListCollection, Stack, Text, HStack } from "@chakra-ui/react"
import { useDebouncedState } from '@tanstack/react-pacer'
import { useQuery } from '@tanstack/react-query';
import { tanQueries } from "../../queries/index.js";
import { albumSearchResultToCredit, artistSearchResultToCredit, trackSearchResultToCredit, type TrackSearchResult } from "../../../core/Api.js";
import React, { useCallback, useEffect, useState } from "react";
import { ArtistCreditTags } from "../ArtistCreditDisplay.js";
import { LeftSideMetadataResultContent, MetadataPickMenu, MetadataSearchCombobox, type MetadataPartials } from "./MetadataResults.js";
import type { Credit } from "../../../core/Atomic.js";
import { MusicServiceIndicators } from "../musicServices/MusicServiceIndicators.js";

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
                {album.name} {album.type !== undefined ? `(${album.type})` : ''}<MusicServiceIndicators services={albumSearchResultToCredit(album).metadata ?? []}/> {andCount}
            </HStack>
        </Text>)
    }

    let artistTags: React.JSX.Element | undefined = undefined;
    if (artists.length > 0) {
        artistTags = <ArtistCreditTags data={artists.map(artistSearchResultToCredit)} />
    }

    return (
        <HStack gap="4" flexGrow="1">
            <LeftSideMetadataResultContent {...props.data} />
            <Stack gap="1" flexGrow="1">
                <Text fontWeight="medium" mb="1">
                    <HStack>
                        {name} <MusicServiceIndicators services={trackSearchResultToCredit(props.data).metadata ?? []}/> <MetadataPickMenu data={props.data} partials={trackPartials} onPick={onPick} />
                    </HStack>
                </Text>
                {artistTags}
                {albumContent}
            </Stack>
        </HStack>
    )
}

/** Play data to change when a track is selected. Artists and album are only included if the selected track has them. */
export interface TrackOnChange {
    track: Credit
    artists?: Credit[]
    album?: Credit
}

export interface TrackSearchProps {
    initial?: Credit
    onChange: (val: TrackOnChange) => void
}

const trackSearchResultToOnChange = (val: TrackSearchResult): TrackOnChange => {
    const change: TrackOnChange = { track: trackSearchResultToCredit(val) };
    if (val.artists !== undefined && val.artists.length > 0) {
        change.artists = val.artists.map(artistSearchResultToCredit);
    }
    if (val.album !== undefined) {
        change.album = albumSearchResultToCredit(val.album);
    }
    return change;
}

export const TrackSearch = (props: TrackSearchProps) => {

    const {
        initial,
        onChange = (val) => console.log(val, 'Selected value for prop')
    } = props;

    const [selectedItem, setSelectedItem] = useState<Credit>(initial ?? {name: ''});
    const [debouncedQuery, setDebouncedQuery] = useDebouncedState<string>(initial?.name ?? '', { wait: 500 });

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
        setSelectedItem(trackSearchResultToCredit(val));
        onChange(trackSearchResultToOnChange(val));
    },[setSelectedItem, onChange]);

    const services = selectedItem.metadata ?? [];
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