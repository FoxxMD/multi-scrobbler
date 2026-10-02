import { useListCollection, Stack, Text, HStack } from "@chakra-ui/react"
import { useDebouncedState } from '@tanstack/react-pacer'
import { useQuery } from '@tanstack/react-query';
import { tanQueries } from "../../queries/index.js";
import type { ArtistSearchResult } from "../../../core/Api.js";
import { MusicbrainzInfoIcon } from "../musicServices/Musicbrainz.js";
import { useEffect } from "react";
import { LeftSideMetadataResultContent, MetadataPickMenu, MetadataSearchCombobox, type MetadataPartials } from "./MetadataResults.js";

const artistPartials: MetadataPartials<ArtistSearchResult> = {
    name: { label: 'Name only', pick: ({ mbid, ...rest }) => rest },
};

export const ArtistSearchResultItem = (props: { data: ArtistSearchResult, onPick?: (val: ArtistSearchResult) => void }) => {

    const {
        name,
        mbid
    } = props.data;

    return (
        <HStack gap="4" flexGrow="1">
            <LeftSideMetadataResultContent {...props.data} />
            <Stack gap="1" flexGrow="1">
                <Text fontWeight="medium">
                    <HStack>
                        {name} {mbid !== undefined ? <MusicbrainzInfoIcon type="artist" mbid={mbid} tooltip /> : null} <MetadataPickMenu data={props.data} partials={artistPartials} onPick={props.onPick} />
                    </HStack>
                </Text>
            </Stack>
        </HStack>
    )
}

export interface ArtistSearchProps {
    initial?: string
    onChange: (val: ArtistSearchResult) => void
}

export const ArtistSearch = (props: ArtistSearchProps) => {

    const {
        initial = '',
        onChange = (val) => console.log(val, 'Selected value for prop')
    } = props;

    const [debouncedQuery, setDebouncedQuery] = useDebouncedState<string>(initial, { wait: 500 });

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

    return (
        <MetadataSearchCombobox
            placeholder="Type to search for artists"
            collection={collection}
            isLoading={query.isLoading}
            isError={query.isError}
            onChange={onChange}
            onQueryChange={setDebouncedQuery}
            renderItem={(item, onPick) => <ArtistSearchResultItem data={item} onPick={onPick} />}
        />
    );
}