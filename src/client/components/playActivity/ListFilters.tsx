import { Span, Stack, Text, Box, HStack, Flex, Container, Select, Portal, createListCollection, useSelectContext, DatePicker, VStack, Button, Spacer, TagsInput } from '@chakra-ui/react';
import { ComponentType, isComponentTypeSource, PLAY_CLIENT_STATE, PLAY_SOURCE_STATE, PlayState } from '../../../core/Atomic.js';
import React, { ComponentProps, Fragment, useMemo, useCallback, useState } from "react"
import dayjs, { Dayjs } from 'dayjs';
import doy from 'dayjs/plugin/dayOfYear.js';
import "./PlayList.scss";
import { ToggleButtonVariant } from '../ToggleButton.js';
import { capitalize } from '../../../core/StringUtils.js';
import { PlayStateBadge } from '../Badges.js';
import { LuCalendar } from 'react-icons/lu';
import {
    DateFormatter,
    getLocalTimeZone,
    isSameDay,
    isToday,
    today,
    Time,
    type DateValue,
    toZoned,
    parseDateTime,
    toCalendarDateTime
} from "@internationalized/date"

const noop = (_) => null;

const SelectValue = () => {
    const select = useSelectContext()
    const items = select.selectedItems as Array<{ label: string; value: PlayState }>
    return (
        <Select.ValueText maxW="100%" placeholder="Select Play States">
            <HStack>
                {items.map((x) => <PlayStateBadge key={x.value} state={x.value}>{x.label}</PlayStateBadge>)}
            </HStack>
        </Select.ValueText>
    )
}

interface PlayStateFilterProps {
    mode: ComponentType
    onChange?: (states: PlayState[]) => void
}
export const PlayStateFilter = (props: PlayStateFilterProps) => {
    const {
        mode,
        onChange = noop
    } = props;
    const availableStates = isComponentTypeSource(mode) ? PLAY_SOURCE_STATE : PLAY_CLIENT_STATE;
    const selectOptions = createListCollection({ items: availableStates.map(x => ({ label: capitalize(x), value: x })) });
    const [enabledStates, setEnabledStates] = useState<PlayState[]>([]);
    // maxW="420px"
    return (
            <Select.Root closeOnSelect={false}  minW="120px" onValueChange={(e) => onChange(e.items.map(x => x.value as PlayState))} multiple collection={selectOptions} size="sm">
                <Select.HiddenSelect />
                <Select.Label>States</Select.Label>
                <Select.Control>
                    <Select.Trigger marginRight="3em">
                        <SelectValue />
                        {/* <Select.ValueText placeholder="Select Play State" /> */}
                    </Select.Trigger>
                    <Select.IndicatorGroup>
                        <Select.Indicator />
                        <Select.ClearTrigger />
                    </Select.IndicatorGroup>
                </Select.Control>
                <Portal>
                    <Select.Positioner>
                        <Select.Content>
                            {selectOptions.items.map((state) => (
                                <Select.Item item={state} key={state.value}>
                                    <PlayStateBadge state={state.value as PlayState}>{state.label}</PlayStateBadge>
                                    <Select.ItemIndicator />
                                </Select.Item>
                            ))}
                        </Select.Content>
                    </Select.Positioner>
                </Portal>
            </Select.Root>);
}

const tz = getLocalTimeZone()
const now = today(tz)
const yesterday = now.subtract({ days: 1 });
const threeDays = now.subtract({ days: 3 });

interface PlayDateRangeFilterProps {
    onChange?: (dates: [string, string]) => void
    values?: [string, string]
    initialValues?: [string, string]
}

const todayRange: [string, string] = [toCalendarDateTime(today(tz), new Time(0, 0, 0, 0)).toString(), toCalendarDateTime(today(tz), new Time(23, 59, 59)).toString()];

export const PlayDateRangeFilter = (props: PlayDateRangeFilterProps) => {
    const {
        onChange = noop,
        values,
        initialValues = todayRange
    } = props;

    const parsedValues = useMemo(() => {
        if (values === undefined) {
            return undefined;
        }
        return [parseDateTime(values[0]), parseDateTime(values[1])]
    }, [values]);

    const parsedInitialValues = useMemo(() => {
        if (initialValues === undefined) {
            return undefined;
        }
        return [parseDateTime(initialValues[0]), parseDateTime(initialValues[1])]
    }, [initialValues]);

    const onChangeCB = useCallback((e: DatePicker.ValueChangeDetails) => {
        if (e.value.length !== 2) {
            return;
        }
        const start = toZoned(toCalendarDateTime(e.value[0], new Time(0, 0, 0, 0)), tz).toAbsoluteString();
        const end = toZoned(toCalendarDateTime(e.value[1], new Time(23, 59, 59)), tz).toAbsoluteString();
        console.log([start, end]);
        onChange([start, end]);
    }, [onChange]);

    return (
        <DatePicker.Root onValueChange={onChangeCB} value={parsedValues} defaultValue={parsedInitialValues} openOnClick selectionMode="range" size="sm" width="min-content">
            <DatePicker.Label width="fit-content">Play Date Range</DatePicker.Label>
            <DatePicker.Control width="min-content">
                <DatePicker.Input index={0} minWidth="100px" flexGrow="0" />
                <DatePicker.Input index={1} minWidth="100px" flexGrow="0"/>
                {/* <DatePicker.IndicatorGroup>
                    <DatePicker.Trigger>
                        <LuCalendar />
                    </DatePicker.Trigger>
                </DatePicker.IndicatorGroup> */}
            </DatePicker.Control>
            <Portal>
                <DatePicker.Positioner>
                    <DatePicker.Content maxW="100dvw" w="min-content" overflow="auto">
                        <Flex
                            px={{ base: "3", sm: "4" }}
                            py={{ base: "3", sm: "4" }}
                            gap={{ base: "3", sm: "6" }}
                            flexDirection={{ base: "column", sm: "row" }}
                        >
                            <VStack
                                align="stretch"
                                gap={{ base: "1.5", sm: "2" }}
                                minW={{ base: "full", sm: "140px" }}
                                height="100%"
                            >
                                <DatePicker.PresetTrigger value={[now, now]} asChild>
                                    <Button variant="surface" size="sm" width="100%">
                                        Today
                                    </Button>
                                </DatePicker.PresetTrigger>
                                <DatePicker.PresetTrigger value={[yesterday, yesterday]} asChild>
                                    <Button variant="surface" size="sm" width="100%">
                                        Yesterday
                                    </Button>
                                </DatePicker.PresetTrigger>
                                <DatePicker.PresetTrigger value={[threeDays, now]} asChild>
                                    <Button variant="surface" size="sm" width="100%">
                                        Last 3 days
                                    </Button>
                                </DatePicker.PresetTrigger>
                                <DatePicker.PresetTrigger value="last7Days" asChild>
                                    <Button variant="surface" size="sm" width="100%">
                                        Last 7 days
                                    </Button>
                                </DatePicker.PresetTrigger>
                                <DatePicker.PresetTrigger value="last30Days" asChild>
                                    <Button variant="surface" size="sm" width="100%">
                                        Last 30 days
                                    </Button>
                                </DatePicker.PresetTrigger>
                                <DatePicker.PresetTrigger value="thisMonth" asChild>
                                    <Button variant="surface" size="sm" width="100%">
                                        This month
                                    </Button>
                                </DatePicker.PresetTrigger>
                                <DatePicker.PresetTrigger value="lastMonth" asChild>
                                    <Button variant="surface" size="sm" width="100%">
                                        Last month
                                    </Button>
                                </DatePicker.PresetTrigger>
                            </VStack>
                            <Flex direction="column" flex="1" minW={0}>
                                <DatePicker.View view="day">
                                    <DatePicker.Header />
                                    <DatePicker.DayTable />

                                </DatePicker.View>
                                {/* <DatePicker.View view="month">
                  <DatePicker.Header />
                  <DatePicker.MonthTable />
                </DatePicker.View>
                <DatePicker.View view="year">
                  <DatePicker.Header />
                  <DatePicker.YearTable />
                </DatePicker.View> */}
                            </Flex>
                        </Flex>
                    </DatePicker.Content>
                </DatePicker.Positioner>
            </Portal>
        </DatePicker.Root>
    )
}

interface PhraseFilterProps {
    onChange?: (phrases: string[]) => void
}
export const PhraseFilter = (props: PhraseFilterProps) => {
    const {
        onChange = noop
    } = props;
    return (
    <TagsInput.Root size="sm" minW="150px"  onValueChange={(e) => onChange(e.value)} addOnPaste delimiter=",">
      <TagsInput.Label>Filter Titles, Artists, and Albums</TagsInput.Label>
      <TagsInput.Control>
        <TagsInput.Items />
        <TagsInput.Input placeholder="Add phrase..." />
      </TagsInput.Control>
      <Span textStyle="xs" color="fg.muted" ms="auto">
        Press Enter or Return to add phrases
      </Span>
    </TagsInput.Root>
  )
}