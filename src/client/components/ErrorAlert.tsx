import { Alert, Accordion, Stack, Text, Box, Collapsible, HStack, Highlight, Span, Code, useCollapsible, UseCollapsibleReturn } from '@chakra-ui/react';
import { Fragment, ComponentProps, useEffect, useState } from 'react';
import { ChakraCodeBlock } from './CodeBlock';
import { ChakraClip } from './ChakraClipboard';
import { ErrorIsh, isErrorIsh } from '../../core/ErrorUtils';
import { EllipsisButton, FatArrowRight } from './icons/ChakraIcons';
import { ErrorObject } from 'serialize-error';

export interface ErrorAlertProps {
    error: ErrorIsh
    status?: "error" | "info" | "warning" | "success" | "neutral"
}

const ErrorBlock = (props: {data: ErrorData, cause?: boolean, messageProps?: ComponentProps<typeof Text>, collapsible: UseCollapsibleReturn}) => {
    const {
        data,
        cause,
        collapsible,
        messageProps = {}
    } = props;

        const [open, setOpen] = useState(collapsible.open);
        useEffect(() => {
            setOpen(collapsible.open);
        }, [setOpen, collapsible]);

    const textProps: ComponentProps<typeof Text> = {...(cause ? {color: "fg.muted"} : {}), ...messageProps};
    const containerProps: ComponentProps<typeof HStack> = {};
    if(cause) {
        containerProps.paddingLeft = "2";
    }
    const errorIdentifier = `${data.name ?? ''}${data.code !== undefined ? ` (${data.code}) ` : ''}`;
    const errorElm = errorIdentifier === '' ? null : <Code variant="surface" mx="1">{errorIdentifier}</Code>
    let messageElm: React.JSX.Element = (
        <HStack {...containerProps}>
        {cause ? <FatArrowRight/> : null}
        <Text {...textProps}>{cause ? <Span fontWeight="semibold">Caused By: </Span> : ''}{errorElm}{data.message}</Text>
    </HStack>

    );

    if(data.stack === undefined) {
        return messageElm;
    }

    return (
    <Collapsible.Root open={open} onOpenChange={(val) => setOpen(val.open)}>
        <HStack>{messageElm}<Collapsible.Trigger><EllipsisButton size="2xs"/></Collapsible.Trigger></HStack>
        <Collapsible.Content paddingY="2">
            <ChakraCodeBlock language="plaintext" code={data.stack} title="Stack" maxLines={6} collapsedMaxHeight="10em" hideBelow="sm"/>
        </Collapsible.Content>
    </Collapsible.Root>
    )
}

export const ErrorAlert = (props: ErrorAlertProps) => {

    if(!isErrorIsh(props.error)) {
        return null;
    }
    let causes: ErrorData[] = [];
    if(isErrorIsh(props.error.cause)) {
        causes = walkError(props.error.cause);
    }

    const collapsible = useCollapsible()

    return (
        <Box>
        <Alert.Root status={props.status ?? 'error'}>
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>{props.error.name ?? 'Error'}<EllipsisButton marginLeft="2" size="2xs" onClick={() => collapsible.setOpen(!collapsible.open)}/></Alert.Title>
                <Alert.Description>
                    <Stack gap="0.5">
                        <ErrorBlock data={props.error} messageProps={{fontWeight: 'semibold'}} collapsible={collapsible}/>
                        {causes.map((x, index) => (
                            <Fragment key={index}>
                                <ErrorBlock key={index} data={x} cause collapsible={collapsible}/>
                            </Fragment>
                        ))}
                    </Stack>
                </Alert.Description>
            </Alert.Content>
            <ChakraClip value={props.error}/>
        </Alert.Root>
        </Box>
    )
}

interface ErrorData {
    name?: string
    code?: string
    message?: string
    stack?: string
}

const walkError = (err: ErrorIsh, errors: ErrorData[] = []): ErrorData[] => {
    const thisErr: ErrorData = {
        name: err.name,
        code: 'code' in err ? err.code : undefined,
        message: err.message,
        stack: err.stack
    };
    errors.push(thisErr);
    if(isErrorIsh(err.cause)) {
        return walkError(err.cause, errors);
    }
    return errors;
}