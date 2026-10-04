import { Box, useListCollection, Stack, Text, HStack } from "@chakra-ui/react"
import { useDebouncedState } from '@tanstack/react-pacer'
import { useQuery } from '@tanstack/react-query';
import { tanQueries } from "../../queries/index.ts";
import { albumSearchResultToCredit, artistSearchResultToCredit, type AlbumSearchResult } from "../../../core/Api.ts";
import React, { useCallback, useEffect, useState } from "react";
import { ArtistCreditTags } from "../ArtistCreditDisplay.tsx";
import { LeftSideMetadataResultContent, MetadataPickMenu, MetadataSearchCombobox, type MetadataPartials } from "./MetadataResults.tsx";
import type { Credit } from "../../../core/Atomic.ts";
import { MusicServiceIndicators } from "../musicServices/MusicServiceIndicators.tsx";

const albumPartials: MetadataPartials<AlbumSearchResult> = {
    album: { label: 'Album only', pick: ({ artists, ...rest }) => rest },
};

export const AlbumSearchResultItem = (props: { data: AlbumSearchResult, onPick?: (val: AlbumSearchResult) => void }) => {

    const {
        name,
        type,
        artists = [],
    } = props.data;

    let artistTags: React.JSX.Element | undefined = undefined;
    if(artists.length > 0) {
        artistTags = <ArtistCreditTags data={artists.map(artistSearchResultToCredit)} />
    }

    return (
        <HStack gap="4" flexGrow="1">
            <Stack>
            <LeftSideMetadataResultContent {...props.data}/>
            </Stack>
            <Stack gap="1" flexGrow="1">
                <Text fontWeight="medium">
                    <HStack gap="1">
                        {name}{type !== undefined ? <Box>({type})</Box> : undefined}<MusicServiceIndicators services={albumSearchResultToCredit(props.data).metadata ?? []}/>
                        <MetadataPickMenu data={props.data} partials={albumPartials} onPick={props.onPick} />
                    </HStack>
                </Text>
                {artistTags}
            </Stack>
        </HStack>
    )
}

/** Play data to change when an album is selected. Artists are only included if the selected album has them. */
export interface AlbumOnChange {
    album: Credit
    artists?: Credit[]
}

const albumSearchResultToOnChange = (val: AlbumSearchResult): AlbumOnChange => {
    const change: AlbumOnChange = { album: albumSearchResultToCredit(val) };
    if (val.artists !== undefined && val.artists.length > 0) {
        change.artists = val.artists.map(artistSearchResultToCredit);
    }
    return change;
}

export interface AlbumSearchProps {
    initial?: Credit
    onChange: (val: AlbumOnChange) => void
}

export const AlbumSearch = (props: AlbumSearchProps) => {

    const {
        initial,
        onChange = (val) => console.log(val, 'Selected value for prop')
    } = props;

    const [selectedItem, setSelectedItem] = useState<Credit>(initial ?? {name: ''});
    const [debouncedQuery, setDebouncedQuery] = useDebouncedState<string>(initial?.name ?? '', { wait: 500 });

    const query = useQuery({
        enabled: debouncedQuery !== '',
        ...tanQueries.metadata.album(debouncedQuery)
    });

    const { collection, set } = useListCollection<AlbumSearchResult>({
        initialItems: query.data?.data ?? [],
        itemToString: (item) => item.name,
        itemToValue: (item) => item.id,
    });

    useEffect(() => {
        if (query.isSuccess) {
            set(query.data.data);
        }
    }, [query, set])

    const doChange = useCallback((val: AlbumSearchResult) => {
        setSelectedItem(albumSearchResultToCredit(val));
        onChange(albumSearchResultToOnChange(val));
    },[setSelectedItem, onChange]);

    const services = selectedItem.metadata ?? [];
    let groupContent: React.JSX.Element | undefined = undefined;
    if(services.length > 0) {
        groupContent = <MusicServiceIndicators services={services} link={false}/>
    }

    return (
        <MetadataSearchCombobox
            placeholder="Type to search for albums"
            collection={collection}
            inputGroupContent={groupContent}
            isLoading={query.isLoading}
            key={selectedItem?.name}
            initialInput={selectedItem?.name}
            isError={query.isError}
            onChange={doChange}
            onQueryChange={setDebouncedQuery}
            renderItem={(item, onPick) => <AlbumSearchResultItem data={item} onPick={onPick} />}
        />
    );
}