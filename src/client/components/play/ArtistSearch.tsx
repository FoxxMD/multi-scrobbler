import { useListCollection, Stack, Text, HStack, Badge, Box } from "@chakra-ui/react"
import {  useDebouncedCallback } from '@tanstack/react-pacer'
import { useQuery } from '@tanstack/react-query';
import { tanQueries } from "../../queries/index.js";
import { type ArtistSearchResult, type ArtistSearchSimpleRequestQuery, type TrackDataCreditBase } from "../../../core/Api.js";
import { useCallback, useEffect, useState } from "react";
import { LeftSideMetadataResultContent, MetadataPickMenu, MetadataSearchCombobox, MetadataServiceScore, type MetadataPartials } from "./MetadataResults.js";
import { artistSearchToMusicService, creditSchema, type Credit } from "../../../core/Atomic.js";
import { MusicServiceIndicators } from "../musicServices/MusicServiceIndicators.js";

const artistPartials: MetadataPartials<ArtistSearchResult> = {
    name: { label: 'Name only', pick: ({ image, metadata, ...rest }) => rest },
};

export const ArtistSearchResultItem = (props: { data: ArtistSearchResult, onPick?: (val: ArtistSearchResult) => void }) => {

    const { name, metadata = [] } = props.data;

     const smallMetadataServiceScore = <Badge hideFrom="sm" variant="subtle" size="sm"><MetadataServiceScore {...props.data}/></Badge>

    return (
        <HStack gap="4" flexGrow="1">
            <Box hideBelow="sm"><LeftSideMetadataResultContent {...props.data} /></Box>
            <Stack gap="1" flexGrow="1">
                {smallMetadataServiceScore}
                <Text fontWeight="medium">
                    <HStack>
                        {name} <MusicServiceIndicators services={metadata}/> <MetadataPickMenu data={props.data} partials={artistPartials} onPick={props.onPick} />
                    </HStack>
                </Text>
            </Stack>
        </HStack>
    )
}

export interface ArtistSearchProps {
    initial?: Credit
    onChange: (val: Credit) => void
    contextData?: TrackDataCreditBase
}

export const ArtistSearch = (props: ArtistSearchProps) => {

    const {
        initial,
        onChange = (val) => console.log(val, 'Selected value for prop')
    } = props;

    const [selectedItem, setSelectedItem] = useState<Credit>(initial ?? {name: ''});
    const [searchQuery, setSearchQuery] = useState<ArtistSearchSimpleRequestQuery | TrackDataCreditBase>({artist: initial?.name ?? ''});
    const debouncedSearchQuery = useDebouncedCallback(
    (query: string, context: boolean) => {
        const musicService = artistSearchToMusicService(query);
        if(musicService !== undefined) {
            setSearchQuery({artist: query});
        } else if(context) {
            setSearchQuery({...(props.contextData), artists: [{name: query}]})
        } else {
            setSearchQuery({artist: query});
        }
    },
    { wait: 500 },
    );
    //const [debouncedQuery, setDebouncedQuery] = useDebouncedState<{query: string, context: boolean}>({query: initial?.name ?? '', context: props.context ?? false}, { wait: 500 });

    const query = useQuery({
        enabled: (`artist` in searchQuery && searchQuery.artist !== '') || `artists` in searchQuery && (searchQuery.artists ?? []).length > 0,
        ...tanQueries.metadata.artists(searchQuery)
    });

    const { collection, set } = useListCollection<ArtistSearchResult>({
        initialItems: query.data?.data ?? [],
        itemToString: (item) => item.name,
        itemToValue: (item) => item.id,
    });

    useEffect(() => {
        if (query.isSuccess) {
            set(query.data.data);
        }
    }, [query, set])

    const doChange = useCallback((val: Credit) => {
        // drops the search-only properties of a result
        const credit = creditSchema.parse(val);
        setSelectedItem(credit);
        onChange(credit);
    },[setSelectedItem, onChange]);

    const services = selectedItem.metadata ?? [];
    let groupContent: React.JSX.Element | undefined = undefined;
    if(services.length > 0) {
        groupContent = <MusicServiceIndicators services={services} link={false}/>
    }

    return (
        <MetadataSearchCombobox
            placeholder="Type to search for artists"
            collection={collection}
            inputGroupContent={groupContent}
            initialInput={selectedItem?.name}
            isLoading={query.isLoading}
            isError={query.isError}
            onChange={doChange}
            onFreetext={(name) => doChange({ name })}
            onQueryChange={(query, context) => debouncedSearchQuery(query, context)}
            renderItem={(item, onPick) => <ArtistSearchResultItem data={item} onPick={onPick} />}
        />
    );
}