import { AbsoluteCenter, Avatar, Box, Combobox, HStack, Icon, Menu, Portal, Span, Spinner, Switch, StackSeparator, Text, InputGroup, type ListCollection, Flex } from "@chakra-ui/react"
import type { MetadataResultBase, MetadataResultImage, MetadataResultServiceScore } from "../../../core/Api"
import { BracesIcon, getMusicServiceIconElement, TextIcon } from "../icons/ChakraIcons"
import React, { useId, useRef, useState } from "react"
import { MSErrorBoundary } from "../ErrorBoundary"
import { EllipsisButtonMenu } from "../buttonMenus/ButtonMenu"
import { formatNumber } from "../../../core/DataUtils"
import { TextMuted } from "../TextMuted"

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
        {props.score !== undefined ? <Text color="fg.subtle" textStyle="sm">{formatNumber(props.score, {minimumFractionDigits: 0, maximumFractionDigits: 1})}</Text> : undefined}
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
    defaultOpen?: boolean
    searchContext?: boolean
    onChange: (val: T) => void
    /** Called with the typed text when the user commits it without selecting a result */
    onFreetext: (name: string) => void
    onQueryChange: (query: string, contextMode: boolean) => void
    renderItem: (item: T, onPick: (val: T) => void) => React.JSX.Element
}

export const MetadataSearchCombobox = <T extends MetadataSearchResult>(props: MetadataSearchComboboxProps<T>) => {
    const { placeholder, collection, isLoading, isError, onChange, onFreetext, onQueryChange, renderItem, initialInput = '' } = props;

    // a ref, not state: combobox captures onInteractOutside when the popup opens so state read there is stale
    const rawInput = useRef<string | undefined>(initialInput === '' ? undefined : initialInput);

    const [contextMode, setContextMode] = useState<boolean>(props.searchContext ?? false);
    const [open, setOpen] = useState<boolean>(false);
    // true while the current query was triggered by the mode switch item rather than typing, decides which loading UI is shown
    const [modeSwitched, setModeSwitched] = useState<boolean>(false);

    const commitFreetext = () => {
        if (rawInput.current !== undefined && rawInput.current !== initialInput) {
            onFreetext(rawInput.current);
        }
    };

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

    const ModeIconSwitchHint = !contextMode ? BracesIcon : TextIcon;
    const ModeIconHint = contextMode ? BracesIcon : TextIcon;
    const modeIconElm = <Box padding="0.5" rounded="md" backgroundColor="bg.emphasized"><ModeIconSwitchHint/></Box>
    // capture + stopPropagation so the combobox's own item click never runs, it would select this item and close the popup
    const switchModeItem = (
        <Combobox.Item key="switch-mode" item="switch-mode" onClickCapture={(e) => 
            {
                e.stopPropagation();
                setModeSwitched(true);
                setContextMode(!contextMode);
                onQueryChange(rawInput.current ?? initialInput, !contextMode);
            }}>
            <HStack>Switch to {contextMode ? 'text-only' : 'context'} {modeIconElm} search mode {isLoading ? <Spinner size="xs" borderWidth="1px" /> : undefined}</HStack>
        </Combobox.Item>)

    return (
        <Flex flexGrow="1">
            <MSErrorBoundary>
                <Combobox.Root
                openOnChange={false}
                onOpenChange={(e) => setOpen(e.open)}
                inputBehavior="autohighlight"
                defaultOpen={props.defaultOpen}
                defaultInputValue={initialInput === '' ? undefined : initialInput}
                    allowCustomValue
                    onKeyDown={(e) => {
                        // combobox prevents default when Enter selects a highlighted item
                        if (e.key === 'Enter' && !e.defaultPrevented) {
                            commitFreetext();
                        }
                    }}
                    collection={collection}
                    onInteractOutside={commitFreetext}
                    onValueChange={(val) => {
                        console.log(val, 'value change');
                        onChange(val.items[0]);
                        rawInput.current = undefined;
                    }}
                    onSelect={(val) => {
                        console.log(val, 'select')
                    }}
                    onInputValueChange={(e) => {
                        setModeSwitched(false);
                        onQueryChange(e.inputValue, contextMode);
                        // selecting an item rewrites the input, this is not freetext
                        if (e.reason !== 'item-select') {
                            rawInput.current = e.inputValue;
                        }
                    }}
                >
                    <Combobox.Control>
                        {input}
                        <Combobox.IndicatorGroup>
                            {!isLoading ? <TextMuted textStyle="xs" hideBelow="sm">{collection.size} Matches</TextMuted> : undefined}
                            {!open && isLoading ? <Spinner size="xs" borderWidth="1px" /> : undefined}
                            <ModeIconHint/>
                            <Combobox.ClearTrigger />
                            <Combobox.Trigger />
                        </Combobox.IndicatorGroup>
                    </Combobox.Control>
                    <Portal>
                        <Combobox.Positioner>
                            <Combobox.Content>
                                {!isLoading || modeSwitched ? switchModeItem : undefined}
                                {isLoading ? modeSwitched ? undefined : (
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
                                        {(combobox) => {
                                            return collection.items?.map((item) => (
                                            <Combobox.Item key={item.id} item={item.id}>
                                                {renderItem(item, (val) => {
                                                    onChange(val);
                                                    rawInput.current = undefined;
                                                    combobox.setInputValue(collection.stringifyItem(val) ?? '', 'item-select');
                                                    combobox.setOpen(false);
                                                })}
                                                <Combobox.ItemIndicator />
                                            </Combobox.Item>
                                        ))}
                                        }
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
