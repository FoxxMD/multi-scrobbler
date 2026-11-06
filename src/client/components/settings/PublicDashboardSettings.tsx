import React from "react";
import { Box, Button, Flex, Heading, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { formOptions, useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as z from "zod";
import { componentDetailLevel, publicDashboardSettingsSchema, type PublicDashboardSettings, type PublicNowPlaying, type UserSettingValue } from "../../../core/UserSettings";
import type { NowPlayingOption } from "../../../core/Api";
import { capitalizeWords } from "../../../core/StringUtils";
import { putUserSetting, tanQueries } from "../../queries";
import { FormCheckbox, FormNativeSelect, FormNumberInput, FormRadio, FormSwitch, type RadioFormItem, type SelectFormGroup } from "../form/formComponents";
import { ErrorAlert } from "../ErrorAlert";
import { EphemeralElement } from "../Badges";
import { CheckIcon } from "../icons/ChakraIcons";
import { InfoPopover } from "../ToggleTip";

// form fields can't be undefined, so "disabled" settings are 'off' / 0 in the form and become undefined when saved
const detailLevel = z.enum(['off', ...componentDetailLevel.options]);
const {recent, refresh} = publicDashboardSettingsSchema.shape;

/** Now Playing as one select value: 'off', 'anySource' or '<from>:<uid>' */
const nowPlayingToValue = (np?: PublicNowPlaying): string => np === undefined ? 'off' : np.from === 'anySource' ? 'anySource' : `${np.from}:${np.uid}`;
const valueToNowPlaying = (val: string): PublicNowPlaying | undefined => {
    if (val === 'off') {
        return undefined;
    }
    if (val === 'anySource') {
        return {from: 'anySource'};
    }
    // uids may contain ':', only split on the first
    const i = val.indexOf(':');
    return {from: val.slice(0, i), uid: val.slice(i + 1)} as PublicNowPlaying;
}

// the real setting schema always has the last word on what is saved
const savedSchema = z.object({publicDashboardEnabled: z.boolean(), publicDashboardSettings: publicDashboardSettingsSchema});

const formSchema = z.object({
    enabled: z.boolean(),
    listenStats: z.boolean(),
    sources: detailLevel,
    clients: detailLevel,
    recent: z.literal(0).or(recent.unwrap()),
    nowPlaying: z.string(),
    refresh: z.literal(0).or(refresh.options[1]),
}).transform((v): z.input<typeof savedSchema> => ({
    publicDashboardEnabled: v.enabled,
    publicDashboardSettings: {
        listenStats: v.listenStats ? true : undefined,
        sources: v.sources === 'off' ? undefined : v.sources,
        clients: v.clients === 'off' ? undefined : v.clients,
        recent: v.recent === 0 ? undefined : v.recent,
        nowPlaying: valueToNowPlaying(v.nowPlaying),
        refresh: v.refresh === 0 ? true : v.refresh,
    }
})).pipe(savedSchema);

type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

/** never saved settings get a useful starting point, nothing is public until enabled is switched on */
const toFormValues = (enabled: boolean | undefined, settings: PublicDashboardSettings | undefined): FormInput => settings === undefined ? {
    enabled: enabled ?? false,
    listenStats: true,
    sources: 'detailed',
    clients: 'detailed',
    recent: 10,
    nowPlaying: 'off',
    refresh: 300,
} : {
    enabled: enabled ?? false,
    listenStats: settings.listenStats ?? false,
    sources: settings.sources ?? 'off',
    clients: settings.clients ?? 'off',
    recent: settings.recent ?? 0,
    nowPlaying: nowPlayingToValue(settings.nowPlaying),
    refresh: settings.refresh === true ? 0 : settings.refresh,
};

const detailItems: RadioFormItem<z.infer<typeof detailLevel>>[] = [
    {value: 'off', label: 'Hidden'},
    {value: 'count', label: 'Count'},
    {value: 'detailed', label: 'Count and Types'},
];

/** Off, any source, then each source and client. A saved value that is no longer available is kept (and marked) so saving does not silently change it */
const nowPlayingGroups = (options: NowPlayingOption[], saved: string): SelectFormGroup[] => {
    const item = (x: NowPlayingOption) => ({value: `${x.from}:${x.uid}`, label: `${x.name} (${capitalizeWords(x.type)})`});
    const groups: SelectFormGroup[] = [
        {items: [{value: 'off', label: 'Hidden'}, {value: 'anySource', label: 'Any Source'}]},
        {label: 'Source', items: options.filter(x => x.from === 'source').map(x => item(x))},
        {label: 'Client', items: options.filter(x => x.from === 'client').map(x => item(x))},
    ];
    if (!groups.some(g => g.items.some(x => x.value === saved))) {
        groups[0].items.push({value: saved, label: `${saved.slice(saved.indexOf(':') + 1)} (unavailable)`});
    }
    return groups.filter(g => g.items.length > 0);
}

export interface PublicDashboardSettingsFormProps {
    enabled?: boolean
    settings?: PublicDashboardSettings
    nowPlayingOptions?: NowPlayingOption[]
    onSubmit: (vals: FormOutput) => void
    isSubmitting?: boolean
    isSuccess?: boolean
}

export const PublicDashboardSettingsForm = (props: PublicDashboardSettingsFormProps) => {
    const {enabled, settings, nowPlayingOptions = [], onSubmit, isSubmitting = false, isSuccess = false} = props;
    const savedNowPlaying = nowPlayingToValue(settings?.nowPlaying);

    const form = useForm({
        ...formOptions.strictSchema(formSchema, {
            defaultValues: toFormValues(enabled, settings),
            validators: [{
                run: formSchema,
                triggers: ['change'],
            }],
        }),
        onSubmit: ({ schemaOutputs }) => onSubmit(schemaOutputs[0]),
    });

    return (
        <form onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
        }}>
            <Stack gap="5" maxWidth="xl">
                <form.Field
                    name="enabled"
                    children={(field) => <FormSwitch field={field} label="Enable Public Dashboard" helperText="Visitors who are not logged in see the dashboard instead of the login form"/>}
                />
                <form.Subscribe
                    selector={(state) => state.values.enabled}
                    children={(isEnabled) => (
                        <Stack gap="5">
                            <form.Field
                                name="listenStats"
                                children={(field) => <FormCheckbox field={field} disabled={!isEnabled} label="Listening Stats" helperText="Total Plays, Scrobbles and time listened"/>}
                            />
                            <form.Field
                                name="sources"
                                children={(field) => <FormRadio field={field} disabled={!isEnabled} label="Sources" items={detailItems}/>}
                            />
                            <form.Field
                                name="clients"
                                children={(field) => <FormRadio field={field} disabled={!isEnabled} label="Clients" items={detailItems}/>}
                            />
                            <form.Field
                                name="recent"
                                children={(field) => <FormNumberInput field={field} disabled={!isEnabled} width="32" min={0} max={recent.unwrap().maxValue ?? undefined} label="Recent Plays" helperText="Number of recently scrobbled Plays to show, 0 to hide"/>}
                            />
                            <form.Field
                                name="nowPlaying"
                                children={(field) => <FormNativeSelect
                                    field={field}
                                    disabled={!isEnabled}
                                    maxWidth="sm"
                                    label={<HStack gap="1">Now Playing <InfoPopover question title={<Heading size="sm">Now Playing</Heading>}>
                                        <Stack maxWidth="sm">
                                            <Text>Updated as often as Refresh allows. Visitors can see <i>when</i> you are listening.</Text>
                                            <Text><strong>Any Source</strong> or a <strong>Source</strong> shows only tracks that are playing.</Text>
                                            <Text>A <strong>Client</strong> mirrors what that client shows as Now Playing. For last.fm/ListenBrainz style clients a paused or stopped track stays until it expires there.</Text>
                                        </Stack>
                                    </InfoPopover></HStack>}
                                    groups={nowPlayingGroups(nowPlayingOptions, savedNowPlaying)}
                                    helperText="Show what is currently playing, uses Refresh."
                                />}
                            />
                            <form.Field
                                name="refresh"
                                children={(field) => <FormNumberInput field={field} disabled={!isEnabled} width="32" min={0} step={60} label="Refresh (seconds)" helperText="How long the dashboard is cached before it is rebuilt, 0 to always show live data (rebuilt at most every few seconds)"/>}
                            />
                        </Stack>
                    )}
                />
                <HStack>
                    <Button loading={isSubmitting} type="submit" variant="subtle" colorPalette="blue">
                        Save {isSuccess && <EphemeralElement expires={2000}><CheckIcon/></EphemeralElement>}
                    </Button>
                    <form.Subscribe
                        selector={(state) => state.isDirty && !state.isDefaultValue}
                        children={(canReset) => canReset ? <Button disabled={isSubmitting} variant="subtle" onClick={() => form.reset()}>Reset</Button> : undefined}
                    />
                </HStack>
            </Stack>
        </form>
    );
}

export const PublicDashboardSettingsFetchable = () => {
    const queryClient = useQueryClient();
    const enabledQuery = useQuery(tanQueries.userSettings.setting('publicDashboardEnabled'));
    const settingsQuery = useQuery(tanQueries.userSettings.setting('publicDashboardSettings'));
    const optionsQuery = useQuery(tanQueries.dashboard.nowPlayingOptions());

    const {mutate, isPending, isSuccess, error: saveError} = useMutation({
        mutationFn: async (vals: FormOutput) => [
            await putUserSetting('publicDashboardEnabled', vals.publicDashboardEnabled),
            await putUserSetting('publicDashboardSettings', vals.publicDashboardSettings),
        ] as const,
        onSuccess: ([enabled, settings]) => {
            queryClient.setQueryData(tanQueries.userSettings.setting('publicDashboardEnabled').queryKey, enabled);
            queryClient.setQueryData(tanQueries.userSettings.setting('publicDashboardSettings').queryKey, settings);
            queryClient.invalidateQueries({queryKey: tanQueries.dashboard.public().queryKey});
        }
    });

    if (enabledQuery.isPending || settingsQuery.isPending || optionsQuery.isPending) {
        return <Flex justify="center" py="8"><Spinner/></Flex>;
    }
    if (enabledQuery.isError) {
        return <ErrorAlert error={enabledQuery.error}/>;
    }
    if (settingsQuery.isError) {
        return <ErrorAlert error={settingsQuery.error}/>;
    }
    if (optionsQuery.isError) {
        return <ErrorAlert error={optionsQuery.error}/>;
    }
    return (
        <Box>
            {saveError !== null ? <ErrorAlert error={saveError}/> : undefined}
            <PublicDashboardSettingsForm
                // new defaults after a save so Reset goes back to what is stored
                key={`${enabledQuery.dataUpdatedAt}-${settingsQuery.dataUpdatedAt}`}
                // query-key-factory loses the per-key generic
                enabled={(enabledQuery.data.value as UserSettingValue<'publicDashboardEnabled'> | null) ?? undefined}
                settings={(settingsQuery.data.value as UserSettingValue<'publicDashboardSettings'> | null) ?? undefined}
                nowPlayingOptions={optionsQuery.data}
                onSubmit={(vals) => mutate(vals)}
                isSubmitting={isPending}
                isSuccess={isSuccess}
            />
        </Box>
    );
}
