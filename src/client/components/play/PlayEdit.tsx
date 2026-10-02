import { HStack, Box, Float, Field, Stack } from "@chakra-ui/react"
import { playEditStrictCreateSchema, type JsonPlayObject, type PlayObjectMinimal } from '../../../core/Atomic.js';
import { MSErrorBoundary } from '../ErrorBoundary.js';
import { useForm, formOptions } from '@tanstack/react-form';
import { TrackSearch } from "./TrackSearch.js";
import { deepmergeCustom } from "deepmerge-ts";


export interface PlayEditProps {
    initialPlay?: PlayObjectMinimal<string>
    initialTab?: 'edit' | 'search'
    context?: 'create' | 'edit'
    onSubmit?: (vals: PlayObjectMinimal<string>) => void
}

const merge = deepmergeCustom({mergeArrays: false});

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
                                <TrackSearch initial={field.form.state.values}
                                    onChange={(val) => {
                                        const merged = merge(val, field.form.state.values)
                                        field.form.setFieldValue('meta', merged.meta);
                                        field.form.setFieldValue('data', merged.data);
                                    }}/>
                                {field.errors.map((error) => (
                                        <Field.ErrorText key={error.message}>
                                          {error.message}
                                        </Field.ErrorText>
                                      ))} 
                            </Field.Root>
                        )}
                    />
                    </Stack>
                </form>
            </MSErrorBoundary>
        </Box>
    );
}