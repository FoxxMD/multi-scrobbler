import { Alert, Accordion, Stack, Text, Box } from '@chakra-ui/react';
import { Fragment } from 'react';
import { ErrorLike } from '../../core/Atomic';
import { ChakraCodeBlock } from './CodeBlock';
import { ChakraClip } from './ChakraClipboard';

export interface ErrorAlertProps {
    error: ErrorLike
    status?: "error" | "info" | "warning" | "success" | "neutral"
}

export const ErrorAlert = (props: ErrorAlertProps) => {

    let causes: ErrorData[] = [];
    if(props.error.cause !== undefined && typeof props.error.cause === 'object') {
        causes = walkError(props.error.cause as ErrorLike);
    }

    return (
        <Box>
        <Alert.Root status={props.status ?? 'error'}>
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>{props.error.name ?? 'Error'}</Alert.Title>
                <Alert.Description>
                    <Stack>
                        <Text>{props.error.message}</Text>
                        {props.error.stack !== undefined ? <ChakraCodeBlock language="plaintext" code={props.error.stack} title="Stack" maxLines={6} collapsedMaxHeight="10em" hideBelow="sm"/> : null}
                        {causes.map(x => (
                            <Fragment>
                                <Text color="fg.muted">Caused By: {x.name ?? ''}{x.code !== undefined ? ` (${x.code}) ` : ''}{x.message}</Text>
                                {x.stack !== undefined ? <ChakraCodeBlock language="plaintext" code={x.stack} title="Stack" maxLines={6} collapsedMaxHeight="10em" hideBelow="sm"/> : null}
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

const walkError = (err: ErrorLike, errors: ErrorData[] = []): ErrorData[] => {
    const thisErr: ErrorData = {
        name: err.name,
        code: 'code' in err ? err.code : undefined,
        message: err.message,
        stack: err.stack
    };
    errors.push(thisErr);
    if(err.cause !== undefined && typeof err.cause === 'object') {
        return walkError(err, errors);
    }
    return errors;
}