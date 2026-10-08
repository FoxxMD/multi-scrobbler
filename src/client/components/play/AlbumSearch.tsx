import { Box, useListCollection, Stack, Text, HStack, Badge, Span } from "@chakra-ui/react"
import { useDebouncedState } from '@tanstack/react-pacer'
import { useQuery } from '@tanstack/react-query';
import { tanQueries } from "../../queries/index.ts";
import { type AlbumSearchResult } from "../../../core/Api.ts";
import React, { useCallback, useEffect, useState } from "react";
import { ArtistCreditTags } from "../ArtistCreditDisplay.tsx";
import { LeftSideMetadataResultContent, MetadataPickMenu, MetadataSearchCombobox, type MetadataPartials } from "./MetadataResults.tsx";
import { creditSchema, type Credit } from "../../../core/Atomic.ts";
import { MusicServiceIndicators } from "../musicServices/MusicServiceIndicators.tsx";
import { CountryFlag } from "../Country.tsx";
import dayjs from "dayjs";

const albumPartials: MetadataPartials<AlbumSearchResult> = {
    album: { label: 'Album only', pick: ({ artists, ...rest }) => rest },
};

export const AlbumSearchResultItem = (props: { data: AlbumSearchResult, onPick?: (val: AlbumSearchResult) => void }) => {

    const {
        name,
        albumType,
        albumTypeHint,
        metadata = [],
        artists = [],
        country,
        date,
    } = props.data;
    const albumHints: string[] = [];
    if(albumType !== undefined) {
        albumHints.push(albumType);
    }
    if(albumTypeHint !== undefined) {
        albumHints.push(albumTypeHint);
    }

    let artistTags: React.JSX.Element | undefined = undefined;
    if(artists.length > 0) {
        artistTags = <ArtistCreditTags data={artists} />
    }

    const countryElm: React.JSX.Element | undefined = country !== undefined ? <CountryFlag iso={country} tooltip={(val) => `Released in ${val}`}/> : undefined;
    let locationDateInfo: React.JSX.Element | undefined = undefined;
    if(countryElm !== undefined && date === undefined) {
        locationDateInfo = countryElm;
    } else if(countryElm !== undefined && date !== undefined) {
        locationDateInfo = <Badge variant="outline">{countryElm}<Span>{dayjs(date).format('YYYY')}</Span></Badge>
    }

    return (
        <HStack gap="4" flexGrow="1">
            <Stack>
            <LeftSideMetadataResultContent {...props.data}/>
            </Stack>
            <Stack gap="1" flexGrow="1">
                <Text fontWeight="medium">
                    <HStack gap="1">
                        {name}{albumHints.length > 0? <Box>({albumHints.join(' -- ')})</Box> : undefined}{locationDateInfo}<MusicServiceIndicators services={metadata}/>
                        <MetadataPickMenu data={props.data} partials={albumPartials} onPick={props.onPick} />
                    </HStack>
                </Text>
                {artistTags}
            </Stack>
        </HStack>
    )
}

/** Play data to change when an album is selected. Album artists are always replaced, even when the selected album has none, so artists from a previous album are not kept. */
export interface AlbumOnChange {
    album: Credit
    albumArtists: Credit[] | undefined
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

    const doChange = useCallback((val: Credit & { artists?: Credit[] }) => {
        // drops the search-only properties of a result
        const album = creditSchema.parse(val);
        setSelectedItem(album);
        onChange({ album, albumArtists: creditSchema.array().optional().parse(val.artists) });
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
            onFreetext={(name) => doChange({ name })}
            onQueryChange={setDebouncedQuery}
            renderItem={(item, onPick) => <AlbumSearchResultItem data={item} onPick={onPick} />}
        />
    );
}