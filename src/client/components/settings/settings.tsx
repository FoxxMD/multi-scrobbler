import { useCallback } from "react"
import {
    VStack,
    Heading,
    SegmentGroup,
    Group,
    Box,
    Button,
    Tabs,
    Field,
    NativeSelect
} from "@chakra-ui/react"
import { useTheme } from "next-themes"
import { BsCircleHalf } from "react-icons/bs";
import { LuMoon, LuSun } from "react-icons/lu"
import { CheckIcon, makeChakraIcon } from "../icons/ChakraIcons";
import { useMutation } from "@tanstack/react-query";
import ky from "ky";
import type { CacheClearType } from "../../../core/Api";
import { EphemeralElement } from "../Badges";
import { AccountSettings } from "../auth/Auth";
import { PublicDashboardSettingsFetchable } from "./PublicDashboardSettings";
import dayjs from "dayjs";
import { DATE_FORMATS, TIME_FORMATS, dayjsTimeFormat, formatNumericDate, useDateFormat, useTimeFormat } from "../../utils/index";

const DarkIcon = makeChakraIcon(LuMoon);
const LightIcon = makeChakraIcon(LuSun);
const SystemIcon = makeChakraIcon(BsCircleHalf);

// day > 12 so the example makes field order unambiguous
const EXAMPLE_DATE = {year: new Date().getFullYear(), month: 12, day: 31};

const PrefSelect = <T extends string>(props: {label: string, value: T | null, onChange: (val: T | null) => void, browserExample: string, options: {value: T, label: string}[]}) => (
    <Field.Root width="max-content">
        <Field.Label>{props.label}</Field.Label>
        <NativeSelect.Root size="sm">
            <NativeSelect.Field value={props.value ?? ''} onChange={(e) => props.onChange(e.currentTarget.value === '' ? null : e.currentTarget.value as T)}>
                <option value="">Browser Default ({props.browserExample})</option>
                {props.options.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
        </NativeSelect.Root>
    </Field.Root>
);

const EXAMPLE_TIME = dayjs().hour(14).minute(5).second(0);

const DateTimeFormatSelects = () => {
    const [datePref, setDatePref] = useDateFormat();
    const [timePref, setTimePref] = useTimeFormat();
    return (
        <>
            <PrefSelect label="Date Format" value={datePref} onChange={setDatePref}
                browserExample={formatNumericDate(null, EXAMPLE_DATE)}
                options={DATE_FORMATS.map(x => ({value: x, label: `${x} (${formatNumericDate(x, EXAMPLE_DATE)})`}))}/>
            <PrefSelect label="Time Format" value={timePref} onChange={setTimePref}
                browserExample={EXAMPLE_TIME.format(dayjsTimeFormat(null))}
                options={TIME_FORMATS.map(x => ({value: x, label: `${x === '12h' ? '12 Hour' : '24 Hour'} (${EXAMPLE_TIME.format(dayjsTimeFormat(x))})`}))}/>
        </>
    );
}

export const SettingsContainer = () => {
    const { resolvedTheme, setTheme, theme } = useTheme();
    const setThemeCB = useCallback((val: string) => {
        switch(val) {
            case 'system':
                setTheme('system');
                localStorage.removeItem('theme');
                break;
            case 'dark':
                setTheme('dark');
                break;
            case 'light':
                setTheme('light');
                break;
        }
    },[setTheme]);

    const {mutate, isPending, variables, isSuccess} = useMutation({
        mutationFn: (clearType: CacheClearType) => ky.delete(`api/cache/${clearType}`)
    });

    return (
        <Tabs.Root defaultValue="account" lazyMount unmountOnExit width="full">
            <Tabs.List>
                <Tabs.Trigger value="account">Account</Tabs.Trigger>
                <Tabs.Trigger value="appearance">Appearance</Tabs.Trigger>
                <Tabs.Trigger value="publicDashboard">Public Dashboard</Tabs.Trigger>
                <Tabs.Trigger value="cache">Cache</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="account" pt="8">
                <AccountSettings/>
            </Tabs.Content>
            <Tabs.Content value="appearance" pt="8">
            <VStack alignItems="flex-start" gap="10">
                <SegmentGroup.Root size="md" value={theme === 'system' ? 'system' : resolvedTheme} onValueChange={(val) => val.value !== null && setThemeCB(val.value)}>
                    <SegmentGroup.Indicator />
                    <SegmentGroup.Item key="dark" value="dark">
                        <SegmentGroup.ItemText>Dark <DarkIcon/></SegmentGroup.ItemText>
                        <SegmentGroup.ItemHiddenInput />
                    </SegmentGroup.Item>
                    <SegmentGroup.Indicator />
                    <SegmentGroup.Item key="light" value="light">
                        <SegmentGroup.ItemText>Light <LightIcon/></SegmentGroup.ItemText>
                        <SegmentGroup.ItemHiddenInput />
                    </SegmentGroup.Item>
                    <SegmentGroup.Indicator />
                    <SegmentGroup.Item key="system" value="system">
                        <SegmentGroup.ItemText>System <SystemIcon/></SegmentGroup.ItemText>
                        <SegmentGroup.ItemHiddenInput />
                    </SegmentGroup.Item>
                </SegmentGroup.Root>
                <DateTimeFormatSelects/>
            </VStack>
            </Tabs.Content>
            <Tabs.Content value="publicDashboard" pt="8">
                <PublicDashboardSettingsFetchable/>
            </Tabs.Content>
            <Tabs.Content value="cache" pt="8">
            <Box>
            <Group attached>
                <Button colorPalette="red"
                 loading={isPending && variables === 'external-api'}
                 loadingText="Clearing..."
                 disabled={isPending}
                 onClick={() => mutate('external-api')}
                 variant="outline">
                    Clear External API Cache {isSuccess && variables === 'external-api' && <EphemeralElement expires={2000}><CheckIcon/></EphemeralElement>}
                </Button>
                <Button colorPalette="red" 
                loading={isPending && variables === 'transforms'} 
                loadingText="Clearing..."
                disabled={isPending}
                onClick={() => mutate('transforms')}
                variant="outline">
                    Clear Transform Cache {isSuccess && variables === 'transforms' && <EphemeralElement expires={2000}><CheckIcon/></EphemeralElement>}
                </Button>
            </Group>
            </Box>
            </Tabs.Content>
        </Tabs.Root>
    )
}