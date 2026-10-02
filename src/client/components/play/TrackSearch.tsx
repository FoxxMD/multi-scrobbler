import { Box, Combobox, useListCollection, Stack, Text, Avatar, Portal, HStack, Span, Spinner, Separator, Icon } from "@chakra-ui/react"
import { MSErrorBoundary } from '../ErrorBoundary.js';
import { useDebouncedState } from '@tanstack/react-pacer'
import { useQuery } from '@tanstack/react-query';
import { tanQueries } from "../../queries/index.js";
import type { ArtistSearchResult } from "../../../core/Api.js";
import { MusicbrainzInfoIcon } from "../musicServices/Musicbrainz.js";
import { useEffect, useState } from "react";
import { getMusicServiceIconElement } from "../icons/ChakraIcons.js";

export const TrackSearchResultItem = (props: { data: ArtistSearchResult }) => (
    <HStack gap="4">
        {props.data.image !== undefined ? (
            <Avatar.Root shape="square" size="xl">
                <Avatar.Fallback name={props.data.name} />
                <Avatar.Image src={props.data.image} />
            </Avatar.Root>
        ) : undefined}
        <Stack gap="1">
            <Text fontWeight="medium">
                <HStack>
                    {props.data.name} {props.data.mbid !== undefined ? <MusicbrainzInfoIcon type="artist" mbid={props.data.mbid} tooltip /> : null}
                </HStack>
            </Text>
            <Text color="fg.muted" textStyle="sm">
                <HStack>
                    {props.data.score !== undefined ? <>Score {props.data.score}<Separator orientation="vertical" height="4" /></> : undefined} 
                    From <Icon size="sm">{getMusicServiceIconElement(props.data.service)}</Icon>
                </HStack>
            </Text>
        </Stack>
    </HStack>
)

export interface ArtistSearchProps {
    initial?: string
    onChange: (val: ArtistSearchResult) => void
}

export const ArtistSearch = (props: ArtistSearchProps) => {

    const {
        initial = '',
        onChange = (val) => console.log(val, 'Selected value for prop')
    } = props;

    const [rawInput, setRawInput] = useState<string | undefined>(undefined);
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
                    width="320px"
                >
                    {/* <Combobox.Label>Select framework</Combobox.Label> */}
                    <Combobox.Control>
                        <Combobox.Input placeholder="Type to search for artists" />
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
                                            <ArtistSearchResultItem data={item}/>
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