import { Span, Stack, Text, Box, HStack, Wrap, Flex, Container, Select, Portal, createListCollection, useSelectContext, DatePicker, VStack, Button, Spacer, TagsInput, Card } from '@chakra-ui/react';
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
    toCalendarDateTime,
    parseAbsolute,
    ZonedDateTime
} from "@internationalized/date"
import { QueryPlaysOptsJson } from '../../../backend/common/database/drizzle/repositories/PlayRepository.js';
import { cardHeaderSeparator } from '../../utils/ComponentUtils.js';
import { CompareDateBetween } from '../../../backend/common/database/drizzle/repositories/BaseRepository.js';

const noop = (_) => null;

const SelectValue = () => {
    const select = useSelectContext()
    const items = select.selectedItems as Array<{ label: string; value: PlayState }>
    return (
        <Select.ValueText  width="100%" maxWidth="100%" placeholder="Select Play States">
            <Wrap rowGap="1" columnGap="1" my="1">
                {items.map((x) => <PlayStateBadge key={x.value} state={x.value}>{x.label}</PlayStateBadge>)}
            </Wrap>
        </Select.ValueText>
    )
}

interface PlayStateFilterProps {
    mode: ComponentType
    onChange?: (states: PlayState[]) => void
}
export const PlayStateFilter = (props: PlayStateFilterProps & {value?: PlayState[] | undefined}) => {
    const {
        mode,
        onChange = noop,
        value
    } = props;
    const availableStates = isComponentTypeSource(mode) ? PLAY_SOURCE_STATE : PLAY_CLIENT_STATE;
    const selectOptions = createListCollection({ items: availableStates.map(x => ({ label: capitalize(x), value: x })) });
    //const [enabledStates, setEnabledStates] = useState<PlayState[]>([]);
    // maxW="420px"
    return (
            <Select.Root value={value} closeOnSelect={false} width="max-content" flexShrink="1"  minW="120px" onValueChange={(e) => onChange(e.items.map(x => x.value as PlayState))} multiple collection={selectOptions} size="sm">
                <Select.HiddenSelect />
                <Select.Label>States</Select.Label>
                <Select.Control>
                    <Select.Trigger >
                        <SelectValue />
                        {/* <Select.ValueText placeholder="Select Play State" /> */}
                        <Select.IndicatorGroup position="relative">
                            <Select.ClearTrigger />
                        <Select.Indicator />
                    </Select.IndicatorGroup>
                    </Select.Trigger>
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

export const todayRange: [string, string] = [toZoned(toCalendarDateTime(today(tz), new Time(0, 0, 0, 0)), tz).toAbsoluteString(), toZoned(toCalendarDateTime(today(tz), new Time(23, 59, 59)), tz).toAbsoluteString()];

export const PlayDateRangeFilter = (props: PlayDateRangeFilterProps & {containerProps?: ComponentProps<typeof DatePicker.Root>}) => {
    const {
        onChange = noop,
        values,
        initialValues = todayRange,
        containerProps = {}
    } = props;

    const parsedValues = useMemo<[ZonedDateTime, ZonedDateTime]>(() => {
        if (values === undefined) {
            return undefined;
        }
        return [parseAbsolute(values[0], tz), parseAbsolute(values[1], tz)]
    }, [values]);

    const parsedInitialValues = useMemo(() => {
        if (initialValues === undefined) {
            return undefined;
        }
        return [parseAbsolute(initialValues[0], tz), parseAbsolute(initialValues[1], tz)]
    }, [initialValues]);

    const [stateVals, setStateVals] = useState<[DatePicker.DateValue, DatePicker.DateValue]>(parsedValues);


    const onChangeCB = useCallback((e: DatePicker.ValueChangeDetails) => {
        const start = toZoned(toCalendarDateTime(e.value[0], new Time(0, 0, 0, 0)), tz).toAbsoluteString();
        const end = e.value[1] !== undefined ? toZoned(toCalendarDateTime(e.value[1], new Time(23, 59, 59)), tz).toAbsoluteString() : undefined;
        console.log([start, end]);
        setStateVals([e.value[0],e.value[1]]);
        if(end !== undefined) {
            onChange([start, end]);
        }
    }, [onChange, setStateVals]);

    return (
        <DatePicker.Root {...containerProps} onValueChange={onChangeCB} value={stateVals} defaultValue={parsedInitialValues} openOnClick selectionMode="range" size="sm" maxW="32rem">
            <DatePicker.Label>Play Date Range</DatePicker.Label>
            <DatePicker.Control >
                <DatePicker.Input index={0} />
                <DatePicker.Input index={1} />
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
    value?: string[] | undefined
}
export const PhraseFilter = (props: PhraseFilterProps) => {
    const {
        onChange = noop,
        value
    } = props;
    return (
    <TagsInput.Root value={value} size="sm" minW="150px" width="fit-content"  onValueChange={(e) => onChange(e.value)} addOnPaste delimiter=",">
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

export const ListFilters = (props: {
    onChange: (e: QueryPlaysOptsJson) => void
    filters: QueryPlaysOptsJson
    componentType: ComponentType,
}) => {
    const {
        filters,
        onChange,
        count
    } = props;

    const setState = useCallback((val: PlayState[]) => {
        const {
            state,
            ...rest
        } = filters;

        onChange({
            ...rest,
            state: val
        });
    }, [onchange, filters]);
    const setDateRange = useCallback((val: [string, string]) => {
        const {
            playedAt,
            ...rest
        } = filters;
        onChange({
            ...rest,
            playedAt: {
                type: 'between',
                range: [val[0], val[1]],
                inclusive: true
            }
        })
    }, [onChange, filters]);
    const setPhrases = useCallback((val: string[]) => {
        const {} = filters;
        onChange(filters);
    }, [onChange, filters]);

    return (
        <Card.Root size="sm" variant="outline">
            <Card.Header {...cardHeaderSeparator}>
                Filters
            </Card.Header>
            <Card.Body px="3" py="4">
                <Wrap gap="5">
                    <PhraseFilter />
                    <PlayStateFilter value={filters.state} onChange={setState} mode={props.componentType} />
                </Wrap>
                <PlayDateRangeFilter values={(filters.playedAt as CompareDateBetween<string>)?.range} onChange={setDateRange} containerProps={{ mt: "2" }} />
            </Card.Body>
        </Card.Root>
    )

}