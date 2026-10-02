import { useListCollection, Stack, Text, HStack } from "@chakra-ui/react"
import { useDebouncedState } from '@tanstack/react-pacer'
import { useQuery } from '@tanstack/react-query';
import { tanQueries } from "../../queries/index.js";
import type { ArtistSearchResult } from "../../../core/Api.js";
import { MusicbrainzInfoIcon } from "../musicServices/Musicbrainz.js";
import { useCallback, useEffect, useState } from "react";
import { LeftSideMetadataResultContent, MetadataPickMenu, MetadataSearchCombobox, type MetadataPartials } from "./MetadataResults.js";
import { type ArtistCredit, type PlayObjectMinimal } from "../../../core/Atomic.js";
import { MusicServiceIcons } from "../icons/ChakraIcons.js";
import { removeUndefinedKeys } from "../../../core/DataUtils.js";

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

const artistResultToPlay = (val: ArtistSearchResult): PlayObjectMinimal<string> => {
    const {
        name,
        mbid,
        spotifyId,
        image
    } = val;

    const play: PlayObjectMinimal<string> = {
        data: {
            artists: [{name, mbid}]
        },
        meta: {}
    }
    if(image !== undefined) {
        play.meta.art = {
            artist: image
        }
    }
    return play;
}

export interface ArtistSearchProps {
    initial?: ArtistCredit
    onChange: (val: ArtistCredit) => void
}

export const ArtistSearch = (props: ArtistSearchProps) => {

    const {
        initial,
        onChange = (val) => console.log(val, 'Selected value for prop')
    } = props;

    const [selectedItem, setSelectedItem] = useState<ArtistCredit>(initial ?? {name: ''});
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

    const doChange = useCallback((val: ArtistCredit) => {
        setSelectedItem(val);
        onChange(val);
    },[setSelectedItem, onChange]);

    const services: string[] = [];
    let groupContent: React.JSX.Element | undefined = undefined;
    if(selectedItem !== undefined) {
        if(selectedItem.mbid !== undefined) {
            services.push('musicbrainz');
        }
    }
    if(services.length > 0) {
        groupContent = <MusicServiceIcons services={services} iconProps={{size: 'sm'}}/>
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