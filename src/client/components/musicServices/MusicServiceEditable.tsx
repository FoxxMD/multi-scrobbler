import { Input, InputGroup, Group, createListCollection, Select, Portal, Field } from "@chakra-ui/react"
import * as z from "zod";
import { useForm, formOptions } from '@tanstack/react-form';
import { musicServiceName, type MusicServiceIdBase, type MusicServices } from "../../../core/Atomic"
import { PlusButton } from "../icons/ChakraIcons";
import { intersect } from "../../../core/DataUtils";

// musicServicesSchema accepts an empty id and reports a missing name as a generic union error
// no optional keys because formOptions.looseSchema (2.0.0-alpha.2) types them as required, a blank idType is '' in the form instead
const musicServiceFormSchema = z.object({
    name: z.enum(musicServiceName.options, 'Type is required'),
    idType: z.string().transform((x) => x === '' ? undefined : x),
    id: z.string().trim().min(1, 'ID is required'),
});

type MusicServiceType = Pick<MusicServiceIdBase, 'name' | 'idType'>;

type MusicServiceSelectItem = { label: string, value: MusicServiceType, category?: string, useWith?: string[] };
const musicServiceColl = createListCollection<MusicServiceSelectItem>({
    items: [
        { label: "ISRC", value: { name: 'isrc' }, useWith: ['track'] },
        { label: "Spotify", value: { name: 'spotify' } },
        { label: "Rocksky", value: { name: 'rocksky' } },
        { label: "Release", value: { name: 'musicbrainz', idType: 'release' }, category: 'Brainz', useWith: ['album'] },
        { label: "Release Group", value: { name: 'musicbrainz', idType: 'release-group' }, category: 'Brainz', useWith: ['album'] },
        { label: "Recording", value: { name: 'musicbrainz', idType: 'recording' }, category: 'Brainz', useWith: ['track'] },
        { label: "Track", value: { name: 'musicbrainz', idType: 'track' }, category: 'Brainz', useWith: ['track'] },
        { label: "Artist", value: { name: 'musicbrainz', idType: 'artist' }, category: 'Brainz', useWith: ['artist'] },
    ],
    itemToString: (item) => item.label,
    itemToValue: (item) => `${item.value.name}${item.value.idType ?? ''}`
});

const categoryItems = Object.groupBy<string, MusicServiceSelectItem>(musicServiceColl.items, (x) => x.category ?? 'none');


export interface MusicServiceIdTypeSelectProps {
    useWith?: string[]
    onChange?: (obj: MusicServiceType) => void
    value?: MusicServiceType
    invalid?: boolean
}

const MusicServiceIdSelect = (props: MusicServiceIdTypeSelectProps) => {
    const {
        useWith,
        onChange = (e) => console.log(e, 'music service id type changed'),
        value,
        invalid
    } = props;
    // always controlled, an empty list is "nothing selected"
    const serviceVal = value !== undefined ? [`${value.name}${value.idType ?? ''}`] : [];

    return (
        <Select.Root collection={musicServiceColl} size="xs" width="90px" rounded="none" invalid={invalid} value={serviceVal} onValueChange={(e) => onChange(e.items[0].value)}>
            <Select.HiddenSelect />
            <Select.Control>
                <Select.Trigger>
                    <Select.ValueText placeholder="Type" />
                </Select.Trigger>
                <Select.IndicatorGroup>
                    <Select.Indicator />
                </Select.IndicatorGroup>
            </Select.Control>
            <Portal>
                <Select.Positioner>
                    <Select.Content>
                        {(categoryItems.none ?? []).map((x) => {
                            if (x.useWith !== undefined && useWith !== undefined && intersect(useWith, x.useWith).length === 0) {
                                return undefined;
                            }
                            return (
                                <Select.Item item={x} key={x.label}>
                                    {x.label}
                                    <Select.ItemIndicator />
                                </Select.Item>
                            );
                        })}
                        {(Object.entries(categoryItems).map(([category, items]) => {
                            if (category === 'none' || items === undefined || items.length === 0) {
                                return undefined;
                            }
                            let usableItems = items;
                            if (useWith !== undefined) {
                                usableItems = items.filter(x => x.useWith === undefined || intersect(x.useWith, useWith).length > 0);
                            }
                            if (usableItems.length === 0) {
                                return undefined;
                            }
                            return (
                                <Select.ItemGroup key={category}>
                                    <Select.ItemGroupLabel>{category}</Select.ItemGroupLabel>
                                    {usableItems.map((item) => (
                                        <Select.Item item={item} key={item.label}>
                                            {item.label}
                                            <Select.ItemIndicator />
                                        </Select.Item>
                                    ))}
                                </Select.ItemGroup>
                            );
                        }))}
                    </Select.Content>
                </Select.Positioner>
            </Portal>
        </Select.Root>
    )
};


export interface MusicServiceIdSelectProps {
    useWith?: string[]
    onSubmit?: (obj: MusicServices) => void
    /** Omit for a new, blank music service */
    value?: MusicServices
}

const logSubmit: MusicServiceIdSelectProps['onSubmit'] = (val) => console.log(val, 'Music Service Submit');

export const MusicServiceInput = (props: MusicServiceIdSelectProps) => {
    const {
        useWith,
        onSubmit = logSubmit,
        value
    } = props;

    // loose so a blank service (no name/idType yet) is a valid editing state, the schema still has to pass to submit
    const opts = formOptions.looseSchema(musicServiceFormSchema, {
        defaultValues: {
            name: value?.name,
            idType: value?.idType ?? '',
            id: value?.id ?? ''
        },
        validators: [{
            run: musicServiceFormSchema,
            triggers: ['change'],
        }],
    });

    const form = useForm({
        ...opts,
        onSubmit: ({ schemaOutputs }) => {
            // idType can only come from the select so it is always valid for the name
            onSubmit(schemaOutputs[0] as MusicServices);
            form.reset();
        }
    });

    // not a <form> element because this input is rendered inside other forms (PlayEdit) and forms cannot be nested
    const submit = () => form.handleSubmit();

    return (
        <form.Field
            name="name"
            children={(nameField) => (
                <form.Field
                    name="id"
                    children={(idField) => (
                        <Field.Root invalid={idField.errors.length > 0} w="full" maxW="sm">
                            <Group attached w="full">
                                <InputGroup
                                    flex="1"
                                    startAddonProps={{ p: "0" }}
                                    startAddon={
                                        // name alone does not change when switching between musicbrainz id types
                                        <form.Subscribe
                                            selector={(state) => state.values.idType}
                                            children={(idType) => (
                                                <MusicServiceIdSelect
                                                    invalid={nameField.errors.length > 0}
                                                    useWith={useWith}
                                                    value={nameField.value != null ? { name: nameField.value, idType: idType || undefined } : undefined}
                                                    onChange={(val) => {
                                                        form.setFieldValue('idType', val.idType ?? '');
                                                        nameField.handleChange(val.name);
                                                    }} />
                                            )}
                                        />
                                    }>
                                    <Input
                                        size="xs"
                                        placeholder="1234-5678"
                                        value={idField.value}
                                        onChange={(e) => idField.handleChange(e.currentTarget.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                submit();
                                            }
                                        }} />
                                </InputGroup>
                                <PlusButton size="xs" bg="bg.subtle" variant="outline" onClick={submit} />
                            </Group>
                            {[...nameField.errors, ...idField.errors].map((error) => (
                                <Field.ErrorText key={error.message}>
                                    {error.message}
                                </Field.ErrorText>
                            ))}
                        </Field.Root>
                    )}
                />
            )}
        />
    )
}
