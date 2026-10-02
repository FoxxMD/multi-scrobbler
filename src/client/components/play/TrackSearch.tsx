import { Box, Combobox, Menu, useListCollection, Stack, Text, Portal, HStack, Span, Spinner } from "@chakra-ui/react"
import { MSErrorBoundary } from '../ErrorBoundary.js';
import { useDebouncedState } from '@tanstack/react-pacer'
import { useQuery } from '@tanstack/react-query';
import { tanQueries } from "../../queries/index.js";
import type { TrackSearchResult } from "../../../core/Api.js";
import { MusicbrainzInfoIcon, type MusicbrainzInfoIconProps } from "../musicServices/Musicbrainz.js";
import React, { useEffect, useState } from "react";
import { ArtistCreditTags } from "../ArtistCreditDisplay.js";
import { LeftSideMetadataResultContent } from "./MetadataResults.js";
import { EllipsisButtonMenu } from "../buttonMenus/ButtonMenu.js";

type TrackPartial = (data: TrackSearchResult) => TrackSearchResult;

const trackPartials: Record<string, { label: string, pick: TrackPartial }> = {
    track: { label: 'Track only', pick: ({ artists, album, albumCount, ...rest }) => rest },
    artists: { label: 'Track + artists', pick: ({ album, albumCount, ...rest }) => rest },
    album: { label: 'Track + album', pick: ({ artists, ...rest }) => rest },
};

export const TrackSearchResultItem = (props: { data: TrackSearchResult, onPick?: (val: TrackSearchResult) => void }) => {

    const { onPick } = props;

    const {
        album,
        albumCount,
        name,
        mbidRecording,
        mbidTrack,
        artists = []
    } = props.data;

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
    if (artists.length > 0) {
        artistTags = <ArtistCreditTags data={artists} />
    }

    let pickMenu: React.JSX.Element | undefined = undefined;
    if (onPick !== undefined) {
        // menu content is portaled but still bubbles through the React tree
        // stop it here so Combobox does not select the whole item or treat Enter as freetext
        pickMenu = (
            <Box marginLeft="auto" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <EllipsisButtonMenu
                    menuItems={Object.entries(trackPartials).map(([value, { label }]) => (
                        <Menu.Item key={value} value={value}>{label}</Menu.Item>
                    ))}
                    menuCallback={(select) => onPick(trackPartials[select.value].pick(props.data))}
                />
            </Box>);
    }

    return (
        <HStack gap="4" flexGrow="1">
            <LeftSideMetadataResultContent {...props.data} />
            <Stack gap="1" flexGrow="1">
                <Text fontWeight="medium" mb="1">
                    <HStack>
                        {name} {mbid !== undefined && mbidType !== undefined ? <MusicbrainzInfoIcon type={mbidType} mbid={mbid} tooltip /> : null} {pickMenu}
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
        if (query.isSuccess) {
            set(query.data.data);
        }
    }, [query, set])

    return (
        <Box position="relative">
            <MSErrorBoundary>
                <Combobox.Root
                    allowCustomValue
                    onKeyDown={(e) => {
                        // combobox prevents default when Enter selects a highlighted item
                        if (e.key === 'Enter' && !e.defaultPrevented) {
                            if (rawInput !== undefined) {
                                console.log('enter and onChange rawInput');
                                onChange({ id: 'nonce', service: 'user', name: rawInput });
                            } else {
                                console.log('enter noop');
                            }
                        }
                    }}
                    collection={collection}
                    onInteractOutside={(e) => {
                        if (rawInput !== undefined) {
                            console.log('outside interact and onChange rawInput');
                            onChange({ id: 'nonce', service: 'user', name: rawInput });
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
                        // selecting an item rewrites the input, this is not freetext
                        if (e.reason !== 'item-select') {
                            setRawInput(e.inputValue);
                        }
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
                                    <Combobox.Context>
                                        {(combobox) => collection.items?.map((item) => (
                                            <Combobox.Item key={item.id} item={item.id}>
                                                <TrackSearchResultItem data={item} onPick={(val) => {
                                                    onChange(val);
                                                    setRawInput(undefined);
                                                    combobox.setInputValue(val.name, 'item-select');
                                                    combobox.setOpen(false);
                                                }} />
                                                <Combobox.ItemIndicator />
                                            </Combobox.Item>
                                        ))}
                                    </Combobox.Context>
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