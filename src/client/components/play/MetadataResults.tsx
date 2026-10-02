import { AbsoluteCenter, Avatar, Box, Combobox, HStack, Icon, Menu, Portal, Span, Spinner, StackSeparator, Text, InputGroup, type ListCollection, Flex } from "@chakra-ui/react"
import type { MetadataResultBase, MetadataResultImage, MetadataResultServiceScore } from "../../../core/Api"
import { getMusicServiceIconElement } from "../icons/ChakraIcons"
import React, { useState } from "react"
import { MSErrorBoundary } from "../ErrorBoundary"
import { EllipsisButtonMenu } from "../buttonMenus/ButtonMenu"

export const LeftSideMetadataResultContent = (props: MetadataResultServiceScore & MetadataResultImage) => {
    if (props.image === undefined) {
        return <MetadataServiceScore {...props} />
    }
    return (
        <ArtworkAvatar
            overlay={<MetadataServiceScore {...props} />}
            {...props} />
    )
}

export const MetadataServiceScore = (props: MetadataResultServiceScore) => (
    <HStack gap="1" separator={<StackSeparator />}>
        <Icon size="sm">{getMusicServiceIconElement(props.service)}</Icon>
        {props.score !== undefined ? <Text color="fg.subtle" textStyle="sm">{props.score}</Text> : undefined}
    </HStack>
)

export const ArtworkAvatar = (props: MetadataResultImage & { overlay?: React.JSX.Element }) => {
    let overlayContent: React.JSX.Element | undefined = undefined;
    if (props.overlay !== undefined) {
        overlayContent = <AbsoluteCenter paddingBottom="40px" axis="horizontal">{props.overlay}</AbsoluteCenter>
    }

    return (
        <Avatar.Root pos="relative" shape="square" size="2xl">
            {overlayContent}
            <Avatar.Fallback name="Art" />
            <Avatar.Image src={props.image} />
        </Avatar.Root>
    )
}

export type MetadataPartials<T> = Record<string, { label: string, pick: (data: T) => T }>;

export interface MetadataPickMenuProps<T> {
    data: T
    partials: MetadataPartials<T>
    onPick?: (val: T) => void
}

export const MetadataPickMenu = <T,>(props: MetadataPickMenuProps<T>) => {
    const { data, partials, onPick } = props;
    if (onPick === undefined) {
        return undefined;
    }
    // menu content is portaled but still bubbles through the React tree
    // stop it here so Combobox does not select the whole item or treat Enter as freetext
    return (
        <Box marginLeft="auto" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <EllipsisButtonMenu
                menuItems={Object.entries(partials).map(([value, { label }]) => (
                    <Menu.Item key={value} value={value}>{label}</Menu.Item>
                ))}
                menuCallback={(select) => onPick(partials[select.value].pick(data))}
            />
        </Box>
    );
}

export type MetadataSearchResult = MetadataResultBase & MetadataResultServiceScore;

export interface MetadataSearchComboboxProps<T extends MetadataSearchResult> {
    placeholder: string
    collection: ListCollection<T>
    isLoading: boolean
    isError: boolean
    inputGroupContent?: React.JSX.Element
    initialInput?: string
    onChange: (val: T) => void
    onQueryChange: (query: string) => void
    renderItem: (item: T, onPick: (val: T) => void) => React.JSX.Element
}

export const MetadataSearchCombobox = <T extends MetadataSearchResult>(props: MetadataSearchComboboxProps<T>) => {
    const { placeholder, collection, isLoading, isError, onChange, onQueryChange, renderItem, initialInput = '' } = props;

    const [rawInput, setRawInput] = useState<string | undefined>(initialInput === '' ? undefined : initialInput);

    // every other property on a search result is optional
    const freetext = (name: string) => ({ id: 'nonce', service: 'user', name }) as T;

    const inputElm = <Combobox.Input placeholder={placeholder} />;
    let input: React.JSX.Element;
    if(props.inputGroupContent !== undefined) {
        input = (
            <InputGroup startAddon={props.inputGroupContent}>
                {inputElm}
            </InputGroup>
        )
    } else {
        input = inputElm;
    }

    return (
        <Flex flexGrow="1">
            <MSErrorBoundary>
                <Combobox.Root
                defaultInputValue={initialInput === '' ? undefined : initialInput}
                    allowCustomValue
                    onKeyDown={(e) => {
                        // combobox prevents default when Enter selects a highlighted item
                        if (e.key === 'Enter' && !e.defaultPrevented) {
                            if (rawInput !== undefined) {
                                console.log('enter and onChange rawInput');
                                onChange(freetext(rawInput));
                            } else {
                                console.log('enter noop');
                            }
                        }
                    }}
                    collection={collection}
                    onInteractOutside={(e) => {
                        if (rawInput !== undefined) {
                            console.log('outside interact and onChange rawInput');
                            onChange(freetext(rawInput));
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
                        onQueryChange(e.inputValue);
                        // selecting an item rewrites the input, this is not freetext
                        if (e.reason !== 'item-select') {
                            setRawInput(e.inputValue);
                        }
                    }}
                >
                    <Combobox.Control>
                        {input}
                        <Combobox.IndicatorGroup>
                            <Combobox.ClearTrigger />
                            <Combobox.Trigger />
                        </Combobox.IndicatorGroup>
                    </Combobox.Control>
                    <Portal>
                        <Combobox.Positioner>
                            <Combobox.Content>
                                {isLoading ? (
                                    <HStack p="2">
                                        <Spinner size="xs" borderWidth="1px" />
                                        <Span>Loading...</Span>
                                    </HStack>
                                ) : isError ? (
                                    <Span p="2" color="fg.error">
                                        Error fetching
                                    </Span>
                                ) : (
                                    <Combobox.Context>
                                        {(combobox) => collection.items?.map((item) => (
                                            <Combobox.Item key={item.id} item={item.id}>
                                                {renderItem(item, (val) => {
                                                    onChange(val);
                                                    setRawInput(undefined);
                                                    combobox.setInputValue(val.name, 'item-select');
                                                    combobox.setOpen(false);
                                                })}
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
        </Flex>
    );
}
