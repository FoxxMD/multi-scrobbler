import { HStack, Box, Float, Field, Stack, Fieldset, Button } from "@chakra-ui/react"
import { playEditStrictCreateSchema, type PlayObjectMinimal } from '../../../core/Atomic.js';
import { MSErrorBoundary } from '../ErrorBoundary.js';
import { useForm, formOptions } from '@tanstack/react-form';
import { TrackSearch } from "./TrackSearch.js";
import { deepmergeCustom } from "deepmerge-ts";
import { ArtistSearch } from "./ArtistSearch.js";
import { TrashIconButton } from "../icons/ChakraIcons.js";


export interface PlayEditProps {
    initialPlay?: PlayObjectMinimal<string>
    initialTab?: 'edit' | 'search'
    context?: 'create' | 'edit'
    onSubmit?: (vals: PlayObjectMinimal<string>) => void
}

const merge = deepmergeCustom({ mergeArrays: false });

const logSubmit: PlayEditProps['onSubmit'] = (val) => console.log(val, 'Play Edit Submit');

export const PlayEdit = (props: PlayEditProps) => {

    const {
        initialPlay: {
            data = {},
            meta = {}
        } = {},
        onSubmit = logSubmit
    } = props;

    const opts = formOptions.strictSchema(playEditStrictCreateSchema, {
        defaultValues: {
            data: {
                track: '',
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

    const form = useForm({
        ...opts,
        onSubmit: ({ schemaOutputs }) => {
            onSubmit(schemaOutputs[0]);
            //props.setOpen(false);
        }
    });


    return (
        <Box position="relative">
            <MSErrorBoundary>
                <Float placement="top-end" offsetX="6" offsetY="2" zIndex={100}>
                    <HStack>

                    </HStack>
                </Float>
                <form
                    onSubmit={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        form.handleSubmit()
                    }}>
                    <Stack>
                        <form.Field
                            name="data"
                            children={(field) => (
                                <Field.Root invalid={field.errors.length > 0}>
                                    <Field.Label>Track (Title)</Field.Label>
                                    <Box width="100%">
                                        <TrackSearch initial={field.form.state.values}
                                            onChange={(val) => {
                                                const merged = merge(val, field.form.state.values)
                                                field.form.setFieldValue('meta', merged.meta);
                                                field.form.setFieldValue('data', merged.data);
                                            }} />
                                        {field.errors.map((error) => (
                                            <Field.ErrorText key={error.message}>
                                                {error.message}
                                            </Field.ErrorText>
                                        ))}
                                    </Box>
                                </Field.Root>
                            )}
                        />
                        <Fieldset.Root size="lg">
                            <Fieldset.Legend>Artists</Fieldset.Legend>
                            <Fieldset.Content>
                                <form.ArrayField name="data.artists">
                                    {(array) => (
                                        <Stack>
                                            
                                            {array.value.map((artist, i) => <form.Field
                                                    key={i}
                                                    name={`data.artists[${i}]`}
                                                    children={(field) => (
                                                        <Field.Root invalid={field.errors.length > 0}>
                                                            <HStack width="100%" flexGrow="1">
                                                                <ArtistSearch initial={field.value}
                                                                    onChange={(val) => {
                                                                        field.handleChange(val);
                                                                    }} />
                                                                {field.errors.map((error) => (
                                                                    <Field.ErrorText key={error.message}>
                                                                        {error.message}
                                                                    </Field.ErrorText>
                                                                ))}
                                                                {i !== 0 ? <TrashIconButton colorPalette="red" onClick={() => array.removeValue(i)} /> : undefined}
                                                            </HStack>
                                                        </Field.Root>
                                                    )}
                                                />)}
                                            <Button variant="subtle" maxW="400px" onClick={() => array.pushValue({name: ''})}>Add Artist</Button>
                                        </Stack>
                                    )}
                                </form.ArrayField>
                            </Fieldset.Content>
                        </Fieldset.Root>
                    </Stack>
                </form>
            </MSErrorBoundary>
        </Box>
    );
}