import { Box, useListCollection, Stack, Text, HStack } from "@chakra-ui/react"
import { useDebouncedState } from '@tanstack/react-pacer'
import { useQuery } from '@tanstack/react-query';
import { tanQueries } from "../../queries/index.ts";
import type { AlbumSearchResult } from "../../../core/Api.ts";
import React, { useCallback, useEffect, useState } from "react";
import { ArtistCreditTags } from "../ArtistCreditDisplay.tsx";
import { LeftSideMetadataResultContent, MetadataPickMenu, MetadataSearchCombobox, type MetadataPartials } from "./MetadataResults.tsx";
import type { ArtistCredit, ArtMeta, BrainzMeta, SpotifyMeta, TrackMeta } from "../../../core/Atomic.ts";
import { removeUndefinedKeys } from "../../../core/DataUtils.ts";
import type { MusicServicesAny } from '../../../core/MusicMetadata.ts';
import { MusicServiceIndicators } from "../musicServices/MusicServiceIndicators.tsx";

const albumPartials: MetadataPartials<AlbumSearchResult> = {
    album: { label: 'Album only', pick: ({ artists, ...rest }) => rest },
};

export const albumSearchResultToMusicServices = (val: MinimalResult): MusicServicesAny[] => {
    const musicServices: MusicServicesAny[] = [];
    if (val.mbidRelease) {
        musicServices.push({ name: 'musicbrainz', id: val.mbidRelease, idHint: 'release' });
    } else if (val.mbidReleaseGroup) {
        musicServices.push({ name: 'musicbrainz', id: val.mbidReleaseGroup, idHint: 'release-group' });
    }
    return musicServices;
}

export const AlbumSearchResultItem = (props: { data: AlbumSearchResult, onPick?: (val: AlbumSearchResult) => void }) => {

    const {
        name,
        type,
        artists = [],
    } = props.data;

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
                        {name}{type !== undefined ? <Box>({type})</Box> : undefined}<MusicServiceIndicators services={albumSearchResultToMusicServices(props.data)}/>
                        <MetadataPickMenu data={props.data} partials={albumPartials} onPick={props.onPick} />
                    </HStack>
                </Text>
                {artistTags}
            </Stack>
        </HStack>
    )
}

type MinimalResult = Pick<AlbumSearchResult, 'name' | 'mbidRelease' | 'mbidReleaseGroup' | 'spotifyId'>

interface MinimalOnChange {
    data: {
        artists?: ArtistCredit[]
        album: string
        meta?: TrackMeta
    }
    meta: {
        art?: ArtMeta
    }
}

const albumSearchResultToOnChange = (val: AlbumSearchResult): MinimalOnChange => {
    const playPartial: MinimalOnChange = {
        data: {
            album: val.name,
            artists: val.artists !== undefined && val.artists.length > 0 ? val.artists.map((x) => ({name: x.name, mbid: x.mbid})) : undefined,
            meta: removeUndefinedKeys<TrackMeta>({
                brainz: removeUndefinedKeys<BrainzMeta>({
                    album: val.mbidRelease,
                    releaseGroup: val.mbidReleaseGroup
                }),
                spotify: removeUndefinedKeys<SpotifyMeta>({
                    album: val.spotifyId
                })
            })
        },
        meta: {
            art: removeUndefinedKeys<ArtMeta>({
                album: val.image
            })
        }
    }

    return playPartial;
}
export interface AlbumSearchProps {
    initial?: MinimalResult
    onChange: (val: MinimalOnChange) => void
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
        onChange(albumSearchResultToOnChange(val));
    },[setSelectedItem, onChange]);

    const services = albumSearchResultToMusicServices(selectedItem);
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