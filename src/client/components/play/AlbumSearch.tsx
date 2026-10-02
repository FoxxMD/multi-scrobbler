import { Box, useListCollection, Stack, Text, HStack } from "@chakra-ui/react"
import { useDebouncedState } from '@tanstack/react-pacer'
import { useQuery } from '@tanstack/react-query';
import { tanQueries } from "../../queries/index.ts";
import type { AlbumSearchResult } from "../../../core/Api.ts";
import { MusicbrainzInfoIcon, type MusicbrainzInfoIconProps } from "../musicServices/Musicbrainz.tsx";
import React, { useCallback, useEffect, useState } from "react";
import { ArtistCreditTags } from "../ArtistCreditDisplay.tsx";
import { LeftSideMetadataResultContent, MetadataPickMenu, MetadataSearchCombobox, type MetadataPartials } from "./MetadataResults.tsx";
import { MusicServiceIcons } from "../icons/ChakraIcons.tsx";

const albumPartials: MetadataPartials<AlbumSearchResult> = {
    album: { label: 'Album only', pick: ({ artists, ...rest }) => rest },
};

export const AlbumSearchResultItem = (props: { data: AlbumSearchResult, onPick?: (val: AlbumSearchResult) => void }) => {

    const {
        name,
        mbidRelease,
        mbidReleaseGroup,
        type,
        artists = [],
    } = props.data;

    let mbidType: MusicbrainzInfoIconProps['type'] | undefined = undefined;
    let mbid: string | undefined = undefined;
    if (mbidRelease !== undefined) {
        mbidType = 'release';
        mbid = mbidRelease;
    } else if (mbidReleaseGroup !== undefined) {
        mbidType = 'release-group';
        mbid = mbidReleaseGroup;
    }

    let artistTags: React.JSX.Element | undefined = undefined;
    if(artists.length > 0) {
        artistTags = <ArtistCreditTags data={artists} />
    }

    return (
        <HStack gap="4" flexGrow="1">
            <Stack>
            <LeftSideMetadataResultContent {...props.data}/>
            </Stack>
            <Stack gap="1" flexGrow="1">
                <Text fontWeight="medium">
                    <HStack gap="1">
                        {name}{type !== undefined ? <Box>({type})</Box> : undefined}{mbid !== undefined && mbidType !== undefined ? <MusicbrainzInfoIcon type={mbidType} mbid={mbid} tooltip /> : null}
                        <MetadataPickMenu data={props.data} partials={albumPartials} onPick={props.onPick} />
                    </HStack>
                </Text>
                {artistTags}
            </Stack>
        </HStack>
    )
}

type MinimalResult = Pick<AlbumSearchResult, 'name' | 'mbidRelease' | 'mbidReleaseGroup' | 'spotifyId'>

export interface AlbumSearchProps {
    initial?: MinimalResult
    onChange: (val: AlbumSearchResult) => void
}

export const AlbumSearch = (props: AlbumSearchProps) => {

    const {
        initial,
        onChange = (val) => console.log(val, 'Selected value for prop')
    } = props;

    const [selectedItem, setSelectedItem] = useState<MinimalResult>(initial ?? {name: ''});
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
        setSelectedItem(val);
        onChange(val);
    },[setSelectedItem, onChange]);

    const services: string[] = [];
    let groupContent: React.JSX.Element | undefined = undefined;
    if(selectedItem !== undefined) {
        if(selectedItem.mbidRelease !== undefined || selectedItem.mbidReleaseGroup !== undefined) {
            services.push('musicbrainz');
        }
        if(selectedItem.spotifyId !== undefined) {
            services.push('spotify');
        }
    }
    if(services.length > 0) {
        groupContent = <MusicServiceIcons services={services} iconProps={{size: 'sm'}}/>
    }

    return (
        <MetadataSearchCombobox
            placeholder="Type to search for albums"
            collection={collection}
            inputGroupContent={groupContent}
            isLoading={query.isLoading}
            isError={query.isError}
            onChange={doChange}
            onQueryChange={setDebouncedQuery}
            renderItem={(item, onPick) => <AlbumSearchResultItem data={item} onPick={onPick} />}
        />
    );
}