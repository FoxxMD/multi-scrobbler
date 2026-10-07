import { HStack, Box, Field, Stack, Fieldset, Button, IconButton, DateInput, DatePicker, Portal } from "@chakra-ui/react"
import { playEditStrictCreateSchema, type PlayObjectMinimal } from '../../../core/Atomic.js';
import { MSErrorBoundary } from '../ErrorBoundary.js';
import { useForm, formOptions } from '@tanstack/react-form';
import { TrackSearch } from "./TrackSearch.js";
import { ArtistSearch } from "./ArtistSearch.js";
import { CopyToRight, ResetIconRaw, TrashIconButton } from "../icons/ChakraIcons.js";
import { useState } from "react";
import { AlbumSearch } from "./AlbumSearch.js";
import { DurationSepEditable } from "./DurationEditable.js";
import { Tooltip } from "../ToggleTip.js";
import { hashObject } from "../../../core/StringUtils.js";
import { dedupAlbumArtists } from "../../../core/MusicMetadata.js";
import { LuCalendar } from "react-icons/lu";
import { parseAbsoluteToLocal, today, getLocalTimeZone, toZoned, DateFormatter } from '@internationalized/date';

export interface PlayEditProps {
    initialPlay?: PlayObjectMinimal<string>
    context?: 'create' | 'edit',
    isSubmitting?: boolean,
    onSubmit?: (vals: PlayObjectMinimal<string>) => void
    onCancel?: () => void
}

const logSubmit: PlayEditProps['onSubmit'] = (val) => console.log(val, 'Play Edit Submit');
const cancelNoop = () => console.log('Clicked cancel');

const tz = getLocalTimeZone();

// segment order and separators come from the formatter locale, en-ZA is the english locale that formats as YYYY/MM/DD
const formatter = new DateFormatter("en-ZA", {
    day: "2-digit",
    month: '2-digit',
    year: 'numeric',
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
})

// structural type so it accepts a field of any value type without spelling out ReactFieldApi's generics
const ResetButton = ({ field, onClickAdditional }: { field: { meta: { isDefaultValue: boolean }, reset: () => void }, onClickAdditional?: () => void }) => {
    if (!field.meta.isDefaultValue) {
        return <Tooltip content="Reset"><IconButton variant="subtle" onClick={() => {
            field.reset();
            if (onClickAdditional !== undefined) {
                onClickAdditional();
            }
        }}><ResetIconRaw /></IconButton></Tooltip>
    }
    return undefined;
}

export const PlayEdit = (props: PlayEditProps) => {

    const {
        context = 'edit',
        initialPlay: {
            data = {},
            meta = {}
        } = {},
        isSubmitting = false,
        onSubmit = logSubmit,
        onCancel = cancelNoop
    } = props;

    const opts = formOptions.strictSchema(playEditStrictCreateSchema, {
        defaultValues: {
            data: {
                track: { name: '' },
                artists: [],
                ...data
            },
            meta: {
                ...meta
            }
        },
        validators: [{
            run: playEditStrictCreateSchema,
            triggers: [],
        }],
    });

    // ArrayField only re-renders on length/_arrayVersion change, so remount artists and album artists when a search replaces them
    const [artistsVersion, setArtistsVersion] = useState(0);

    const form = useForm({
        ...opts,
        onSubmit: ({ schemaOutputs }) => {
            const [play] = schemaOutputs;
            onSubmit({ ...play, data: dedupAlbumArtists(play.data) });
            //props.setOpen(false);
        }
    });


    // track artists and album artists are edited the same way, album artists can be empty
    const artistsField = (name: 'data.artists' | 'data.albumArtists', legend: string, minRows: number) => (
        <Fieldset.Root size="lg">
            <Fieldset.Legend>{legend}</Fieldset.Legend>
            <Fieldset.Content>
                <form.ArrayField key={artistsVersion} name={name}>
                    {(array) => (
                        <Stack>

                            {(array.value ?? []).map((artist, i) =>
                                <form.Field
                                    key={i}
                                    name={`${name}[${i}]`}
                                    // schema issues are reported on descendants (.name), route them to this field
                                    errorBoundary
                                    children={(field) => (
                                        <Field.Root invalid={field.errors.length > 0}>
                                            <Stack width="100%" flexGrow="1">
                                                <HStack width="100%" flexGrow="1">
                                                    <ArtistSearch initial={field.value}
                                                        onChange={(val) => {
                                                            field.handleChange(val);
                                                        }} />
                                                    <HStack gapX="4">
                                                        <ResetButton field={field} onClickAdditional={() => setArtistsVersion(v => v + 1)} />
                                                        {i >= minRows ? <TrashIconButton colorPalette="red" onClick={() => array.removeValue(i)} /> : undefined}
                                                    </HStack>
                                                </HStack>
                                                {field.errors.map((error) => (
                                                    <Field.ErrorText key={error.message}>
                                                        {error.message}
                                                    </Field.ErrorText>
                                                ))}
                                            </Stack>
                                        </Field.Root>
                                    )}
                                />)}
                            <Field.Root invalid={array.errors.length > 0}>
                                {array.errors.map((error) => (
                                    <Field.ErrorText key={error.message}>
                                        {error.message}
                                    </Field.ErrorText>
                                ))}
                            </Field.Root>
                            <Button variant="subtle" maxW="400px" onClick={() => array.pushValue({ name: '' })}>Add {minRows === 0 ? 'Album Artist' : 'Artist'}</Button>
                        </Stack>
                    )}
                </form.ArrayField>
            </Fieldset.Content>
        </Fieldset.Root>
    );

    return (
        <Box position="relative">

            <MSErrorBoundary>
                <form
                    onSubmit={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        form.handleSubmit()
                    }}>
                    <HStack justify="flex-end">
                        <Button loading={isSubmitting} type="submit" variant="subtle" colorPalette="blue">{context === 'edit' ? 'Save' : 'Create'}</Button>
                        <Button disabled={isSubmitting} variant="subtle" colorPalette="red" onClick={() => onCancel()}>Cancel</Button>
                        <form.Subscribe
                            selector={(state) => state.isDirty && !state.isDefaultValue}
                            children={(canReset) => canReset ? <Button
                                disabled={isSubmitting}
                                variant="subtle" onClick={() => {
                                    form.reset();
                                    setArtistsVersion(v => v + 1);
                                }}>Reset</Button> : undefined}
                        />
                    </HStack>
                    <Stack>
                        <form.Field
                            name="data.track"
                            errorBoundary
                            children={(field) => (
                                <Field.Root invalid={field.errors.length > 0}>
                                    <Field.Label>Track (Title)</Field.Label>
                                    <Stack width="100%" flexGrow="1">
                                        <HStack width="100%" flexGrow="1">
                                            <TrackSearch
                                                // TrackSearch only reads initial on mount, remount so a reset (or any outside change) shows in the input
                                                key={hashObject(field.form.state.values.data.track ?? {})}
                                                initial={field.form.state.values.data.track}
                                                onChange={(val) => {
                                                    // selected credits replace existing ones entirely so ids/images from a previous selection are not kept
                                                    field.form.setFieldValue('data', { ...field.form.state.values.data, ...val });
                                                    setArtistsVersion(v => v + 1);
                                                }} />
                                            <ResetButton field={field} />
                                        </HStack>
                                        {field.errors.map((error) => (
                                            <Field.ErrorText key={error.message}>
                                                {error.message}
                                            </Field.ErrorText>
                                        ))}
                                    </Stack>
                                </Field.Root>
                            )}
                        />
                        {artistsField('data.artists', 'Artists', 1)}
                        <form.Field
                            name="data.album"
                            errorBoundary
                            children={(field) => (
                                <Field.Root invalid={field.errors.length > 0}>
                                    <Field.Label>Album</Field.Label>
                                    <Stack width="100%" flexGrow="1">
                                        <HStack width="100%" flexGrow="1">
                                            <AlbumSearch
                                                key={hashObject(field.form.state.values.data.album ?? {})}
                                                initial={field.form.state.values.data.album}
                                                onChange={(val) => {
                                                    field.form.setFieldValue('data', { ...field.form.state.values.data, ...val });
                                                    setArtistsVersion(v => v + 1);
                                                }} />
                                            <ResetButton field={field} />
                                        </HStack>
                                        {field.errors.map((error) => (
                                            <Field.ErrorText key={error.message}>
                                                {error.message}
                                            </Field.ErrorText>
                                        ))}
                                    </Stack>
                                </Field.Root>
                            )}
                        />
                        {artistsField('data.albumArtists', 'Album Artists', 0)}
                        <HStack wrap="wrap" gap="5">
                            <form.Field
                                name="data.duration"
                                errorBoundary
                                children={(field) => (
                                    <Field.Root invalid={field.errors.length > 0} width="fit-content">
                                        <Field.Label>Duration</Field.Label>
                                        <Field.HelperText>The length of the song</Field.HelperText>
                                        <Stack>
                                            <HStack wrap="wrap" width="100%">
                                                <DurationSepEditable
                                                    allowMouseWheel
                                                    size="sm"
                                                    seconds={field.value}
                                                    onChange={(val: number) => {
                                                        field.handleChange(val);
                                                    }} />

                                                <ResetButton field={field} />
                                                <Tooltip content="Copy Duration to Listened For">
                                                    <IconButton variant="outline" onClick={() => field.form.setFieldValue('data.listenedFor', field.value)}>
                                                        <CopyToRight /></IconButton>
                                                </Tooltip>
                                            </HStack>
                                            {field.errors.map((error) => (
                                                <Field.ErrorText key={error.message}>
                                                    {error.message}
                                                </Field.ErrorText>
                                            ))}
                                        </Stack>
                                    </Field.Root>
                                )}
                            />
                            <form.Field
                                name="data.listenedFor"
                                errorBoundary
                                children={(field) => (
                                    <Field.Root invalid={field.errors.length > 0} width="fit-content">
                                        <Field.Label>Listened For</Field.Label>
                                        <Field.HelperText>The amount of time you listened to this song for</Field.HelperText>
                                        <Stack>
                                            <HStack wrap="wrap" width="100%">
                                                <DurationSepEditable
                                                    allowMouseWheel
                                                    size="sm"
                                                    seconds={field.value}
                                                    onChange={(val: number) => {
                                                        field.handleChange(val);
                                                    }} />
                                                <ResetButton field={field} />
                                            </HStack>
                                            {field.errors.map((error) => (
                                                <Field.ErrorText key={error.message}>
                                                    {error.message}
                                                </Field.ErrorText>
                                            ))}
                                        </Stack>
                                    </Field.Root>
                                )}
                            />
                        </HStack>
                        <form.Field
                            name="data.playDate"
                            errorBoundary
                            // eslint-disable-next-line arrow-body-style
                            children={(field) => {
                                return (
                                    <Field.Root invalid={field.errors.length > 0} width="100%">
                                        <Field.Label>Played At</Field.Label>
                                        <Field.HelperText>The date-time you listened to this song at</Field.HelperText>
                                        <Stack>
                                            <HStack >
                                                <DatePicker.Root
                                                    value={[field.value !== undefined ? parseAbsoluteToLocal(field.value) : today(tz)]}
                                                    onValueChange={(e) => field.handleChange(toZoned(e.value[0], tz).toAbsoluteString())}
                                                >
                                                    <DateInput.Root
                                                        value={[field.value !== undefined ? parseAbsoluteToLocal(field.value) : today(tz)]}
                                                        onValueChange={(e) => field.handleChange(toZoned(e.value[0], tz).toAbsoluteString())}
                                                        granularity="second"
                                                        formatter={formatter}>
                                                        <DatePicker.Control>
                                                            <DateInput.Control>
                                                                <DateInput.Segments pe="10" />
                                                            </DateInput.Control>
                                                            <DatePicker.IndicatorGroup>
                                                                <DatePicker.Trigger>
                                                                    <LuCalendar />
                                                                </DatePicker.Trigger>
                                                            </DatePicker.IndicatorGroup>
                                                        </DatePicker.Control>
                                                        <DateInput.HiddenInput />
                                                    </DateInput.Root>

                                                    <Portal>
                                                        <DatePicker.Positioner>
                                                            <DatePicker.Content>
                                                                <DatePicker.View view="day">
                                                                    <DatePicker.Header />
                                                                    <DatePicker.DayTable />
                                                                </DatePicker.View>
                                                                <DatePicker.View view="month">
                                                                    <DatePicker.Header />
                                                                    <DatePicker.MonthTable />
                                                                </DatePicker.View>
                                                                <DatePicker.View view="year">
                                                                    <DatePicker.Header />
                                                                    <DatePicker.YearTable />
                                                                </DatePicker.View>
                                                            </DatePicker.Content>
                                                        </DatePicker.Positioner>
                                                    </Portal>
                                                </DatePicker.Root>
                                                <ResetButton field={field} />
                                            </HStack>
                                            {field.errors.map((error) => (
                                                <Field.ErrorText key={error.message}>
                                                    {error.message}
                                                </Field.ErrorText>
                                            ))}
                                        </Stack>
                                    </Field.Root>
                                )
                            }}
                        />
                    </Stack>
                </form>
            </MSErrorBoundary>
        </Box>
    );
}