import { Box, Combobox, useListCollection, Stack, Text, Avatar, Portal, HStack, Span, Spinner, StackSeparator, Icon } from "@chakra-ui/react"
import { MSErrorBoundary } from '../ErrorBoundary.js';
import { useDebouncedState } from '@tanstack/react-pacer'
import { useQuery } from '@tanstack/react-query';
import { tanQueries } from "../../queries/index.js";
import type { TrackSearchResult } from "../../../core/Api.js";
import { MusicbrainzInfoIcon, type MusicbrainzInfoIconProps } from "../musicServices/Musicbrainz.js";
import React, { useEffect, useState } from "react";
import { getMusicServiceIconElement } from "../icons/ChakraIcons.js";
import { ArtistCreditTags } from "../ArtistCreditDisplay.js";

export const TrackSearchResultItem = (props: { data: TrackSearchResult }) => {

    const {
        album,
        albumCount,
        service,
        score,
        name,
        mbidRecording,
        mbidTrack,
        artists = []
    } = props.data;

    let artImage: string | undefined;
    if (album?.image !== undefined) {
        artImage = album.image;
    } else {
        artImage = artists.find(x => x.image !== undefined)?.image;
    }
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
    if(artists.length > 0) {
        artistTags = <ArtistCreditTags data={artists} />
    }

    return (
        <HStack gap="4">
            <Stack>
            <HStack separator={<StackSeparator/>}>
            <Icon size="sm">{getMusicServiceIconElement(service)}</Icon>
            {score !== undefined ? <Text color="fg.subtle" textStyle="sm">{score}</Text> : undefined}
            </HStack>
            {artImage !== undefined ? (
                <Avatar.Root shape="square" size="xl">
                    <Avatar.Fallback name="Art" />
                    <Avatar.Image src={artImage} />
                </Avatar.Root>
            ) : undefined}
            </Stack>
            <Stack gap="1">
                <Text fontWeight="medium">
                    <HStack>
                        {name} {mbid !== undefined && mbidType !== undefined ? <MusicbrainzInfoIcon type={mbidType} mbid={mbid} tooltip /> : null}
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

    const [rawInput, setRawInput] = useState<string | undefined>(undefined);
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
        if(query.isSuccess) {
            set(query.data.data);
        }
    },[query, set])

    return (
        <Box position="relative">
            <MSErrorBoundary>
                <Combobox.Root
                    allowCustomValue
                    onKeyDown={(e) => {
                        if(e.key === 'Enter') {
                            if(rawInput !== undefined) {
                                console.log('enter and onChange rawInput');
                                onChange({id: 'nonce', service: 'user', name: rawInput});
                            } else {
                                console.log('enter noop');
                            }
                        }
                    }}
                    collection={collection}
                    onInteractOutside={(e) => {
                        if(rawInput !== undefined) {
                            console.log('outside interact and onChange rawInput');
                            onChange({id: 'nonce', service: 'user', name: rawInput});
                        } else {
                            console.log('outside interact noop');
                        }
                    }}
                    onValueChange={(val) => {
                        console.log(val, 'value change');
                        onChange(val.items[0]);
                        setRawInput(undefined);
                    }}
                    onSelect={(val) => {
                        console.log(val, 'select')
                    }}
                    onInputValueChange={(e) => {
                        setDebouncedQuery(e.inputValue);
                        setRawInput(e.inputValue)
                    }}
                    
                >
                    <Combobox.Control>
                        <Combobox.Input placeholder="Type to search for tracks" />
                        <Combobox.IndicatorGroup>
                            <Combobox.ClearTrigger />
                            <Combobox.Trigger />
                        </Combobox.IndicatorGroup>
                    </Combobox.Control>
                    <Portal>
                        <Combobox.Positioner>
                            <Combobox.Content>
                                {query.isLoading ? (
                                    <HStack p="2">
                                        <Spinner size="xs" borderWidth="1px" />
                                        <Span>Loading...</Span>
                                    </HStack>
                                ) : query.isError ? (
                                    <Span p="2" color="fg.error">
                                        Error fetching
                                    </Span>
                                ) : (
                                    collection.items?.map((item, i) => (
                                        <Combobox.Item key={item.id} item={item.id}>
                                            <TrackSearchResultItem data={item}/>
                                            <Combobox.ItemIndicator />
                                        </Combobox.Item>
                                    ))
                                )}
                                <Combobox.Empty>No items found</Combobox.Empty>
                            </Combobox.Content>
                        </Combobox.Positioner>
                    </Portal>
                </Combobox.Root>
            </MSErrorBoundary>
        </Box>
    );
}