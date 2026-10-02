import { Box, Combobox, useListCollection, Stack, Text, Avatar, Portal, HStack, Span, Spinner, StackSeparator, Icon, AbsoluteCenter } from "@chakra-ui/react"
import { MSErrorBoundary } from '../ErrorBoundary.tsx';
import { useDebouncedState } from '@tanstack/react-pacer'
import { useQuery } from '@tanstack/react-query';
import { tanQueries } from "../../queries/index.ts";
import type { AlbumSearchResult } from "../../../core/Api.ts";
import { MusicbrainzInfoIcon, type MusicbrainzInfoIconProps } from "../musicServices/Musicbrainz.tsx";
import React, { useEffect, useState } from "react";
import { getMusicServiceIconElement } from "../icons/ChakraIcons.tsx";
import { ArtistCreditTags } from "../ArtistCreditDisplay.tsx";

export const AlbumSearchResultItem = (props: { data: AlbumSearchResult }) => {

    const {
        service,
        score,
        name,
        mbidRelease,
        mbidReleaseGroup,
        image,
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

    const sourceContent = (
        <HStack gap="1" separator={<StackSeparator />}>
            <Icon size="sm">{getMusicServiceIconElement(service)}</Icon>
            {score !== undefined ? <Text color="fg.subtle" textStyle="sm">{score}</Text> : undefined}
        </HStack>
    );

    let leftContent: React.JSX.Element | undefined;
    if(image !== undefined) {
        leftContent = (
            <Avatar.Root pos="relative" shape="square" size="2xl">
                    <AbsoluteCenter paddingBottom="40px" axis="horizontal">{sourceContent}</AbsoluteCenter>
                    <Avatar.Fallback name="Art" />
                    <Avatar.Image src={image} />
                    
                </Avatar.Root>
        );
    } else {
        leftContent = sourceContent;
    }


    return (
        <HStack gap="4">
            <Stack>
            {leftContent}
            </Stack>
            <Stack gap="1">
                <Text fontWeight="medium">
                    <HStack gap="1">
                        {name}{type !== undefined ? <Box>({type})</Box> : undefined}{mbid !== undefined && mbidType !== undefined ? <MusicbrainzInfoIcon type={mbidType} mbid={mbid} tooltip /> : null}
                    </HStack>
                </Text>
                {artistTags}
            </Stack>
        </HStack>
    )
}

export interface AlbumSearchProps {
    initial?: string
    onChange: (val: AlbumSearchResult) => void
}

export const AlbumSearch = (props: AlbumSearchProps) => {

    const {
        initial = '',
        onChange = (val) => console.log(val, 'Selected value for prop')
    } = props;

    const [rawInput, setRawInput] = useState<string | undefined>(undefined);
    const [debouncedQuery, setDebouncedQuery] = useDebouncedState<string>(initial, { wait: 500 });

    const query = useQuery({
        enabled: debouncedQuery !== '',
        ...tanQueries.metadata.album(debouncedQuery)
    });

    const { collection, set } = useListCollection<AlbumSearchResult>({
        initialItems: query.data?.data ?? [],
        itemToString: (item) => item.name,//`${item.name}${item.type !== undefined ? ` (${item.type})` : ''}`,
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
                        <Combobox.Input placeholder="Type to search for albums" />
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
                                            <AlbumSearchResultItem data={item}/>
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