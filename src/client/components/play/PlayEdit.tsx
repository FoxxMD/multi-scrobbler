import { HStack, Tabs, Box, Float } from "@chakra-ui/react"
import { playEditStrictCreateSchema, type JsonPlayObject, type PlayObjectMinimal } from '../../../core/Atomic.js';
import { MSErrorBoundary } from '../ErrorBoundary.js';
import { useForm, formOptions } from '@tanstack/react-form';


export interface PlayEditProps {
    initialPlay?: JsonPlayObject | PlayObjectMinimal<string>
    initialTab?: 'edit' | 'search'
    context?: 'create' | 'edit'
    onSubmit: (vals: any) => void
}

export const PlayEdit = (props: PlayEditProps) => {

    const {
        initialPlay: {
            data = {},
            meta = {}
        } = {}
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
            props.onSubmit(schemaOutputs[0]);
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
                {/* <Tabs.Root size="sm" variant="outline" defaultValue={props.initialTab ?? 'edit'}>
                    <Tabs.List>
                        <Tabs.Trigger value="edit">{props.context === 'create' ? 'Create' : 'Edit'}</Tabs.Trigger>
                        <Tabs.Trigger value="search">Search</Tabs.Trigger>
                    </Tabs.List>
                    <Tabs.Content value="edit">
                    </Tabs.Content>
                    <Tabs.Content value="search">
                        Search here
                    </Tabs.Content>
                </Tabs.Root> */}
                
            </MSErrorBoundary>
        </Box>
    );
}