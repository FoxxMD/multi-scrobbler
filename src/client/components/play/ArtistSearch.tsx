import { useListCollection, Stack, Text, HStack } from "@chakra-ui/react"
import { useDebouncedState } from '@tanstack/react-pacer'
import { useQuery } from '@tanstack/react-query';
import { tanQueries } from "../../queries/index.js";
import { artistSearchResultToCredit, type ArtistSearchResult } from "../../../core/Api.js";
import { useCallback, useEffect, useState } from "react";
import { LeftSideMetadataResultContent, MetadataPickMenu, MetadataSearchCombobox, type MetadataPartials } from "./MetadataResults.js";
import { type Credit } from "../../../core/Atomic.js";
import { MusicServiceIndicators } from "../musicServices/MusicServiceIndicators.js";

const artistPartials: MetadataPartials<ArtistSearchResult> = {
    name: { label: 'Name only', pick: ({ mbid, ...rest }) => rest },
};

export const ArtistSearchResultItem = (props: { data: ArtistSearchResult, onPick?: (val: ArtistSearchResult) => void }) => {

    const { name } = props.data;

    return (
        <HStack gap="4" flexGrow="1">
            <LeftSideMetadataResultContent {...props.data} />
            <Stack gap="1" flexGrow="1">
                <Text fontWeight="medium">
                    <HStack>
                        {name} <MusicServiceIndicators services={artistSearchResultToCredit(props.data).metadata ?? []}/> <MetadataPickMenu data={props.data} partials={artistPartials} onPick={props.onPick} />
                    </HStack>
                </Text>
            </Stack>
        </HStack>
    )
}

export interface ArtistSearchProps {
    initial?: Credit
    onChange: (val: Credit) => void
}

export const ArtistSearch = (props: ArtistSearchProps) => {

    const {
        initial,
        onChange = (val) => console.log(val, 'Selected value for prop')
    } = props;

    const [selectedItem, setSelectedItem] = useState<Credit>(initial ?? {name: ''});
    const [debouncedQuery, setDebouncedQuery] = useDebouncedState<string>(initial?.name ?? '', { wait: 500 });

    const query = useQuery({
        enabled: debouncedQuery !== '',
        ...tanQueries.metadata.artists(debouncedQuery)
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

    const doChange = useCallback((val: ArtistSearchResult) => {
        const credit = artistSearchResultToCredit(val);
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
            onQueryChange={setDebouncedQuery}
            renderItem={(item, onPick) => <ArtistSearchResultItem data={item} onPick={onPick} />}
        />
    );
}