import * as React from 'react';
import { Alert } from '@chakra-ui/react';
import { ErrorBoundary, getErrorMessage } from "react-error-boundary";
import { ChakraCodeBlock } from './CodeBlock';

export const MSErrorBoundary = (props: React.PropsWithChildren) => {
    return (
        <ErrorBoundary

            fallbackRender={({ error, resetErrorBoundary }) => (
                <Alert.Root status="error">
                    <Alert.Indicator />
                    <Alert.Content>
                        <Alert.Title>Error while render</Alert.Title>
                        <Alert.Description>
                            <ChakraCodeBlock code={getErrorMessage(error)} language="plaintext" />
                        </Alert.Description>
                    </Alert.Content>
                </Alert.Root>
            )}
        >
            {props.children}

        </ErrorBoundary>
    )
}

