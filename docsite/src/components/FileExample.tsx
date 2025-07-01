import React, { Fragment } from "react"
import CodeBlock, {Props as CodeBlockProps} from '@theme/CodeBlock';
import Admonition from '@theme/Admonition';
import ErrorBoundary from "@docusaurus/ErrorBoundary"
import Error from "@theme/Error"
import { Simulate } from "react-dom/test-utils";
import error = Simulate.error;
import json5 from 'json5';

export interface FileProps extends Omit<CodeBlockProps, 'children'> {
    data: string
    client?: boolean
}

const FileExample = (props: FileProps) => {
    const {
        data,
        client = false,
        ...rest
    } = props;

    let configObj;
    // eslint-disable-next-line prefer-const
    try {
        configObj = json5.parse(data) as object[];
    } catch (e) {
        console.error(e);
        return <Admonition type="danger" title="Unexpected Error">
            <p>Example component crashed because of error!</p>
            <CodeBlock>{e.message}</CodeBlock>
        </Admonition>
    }

    configObj = configObj.filter(x => x.configureAs === undefined || x.configureAs === (client ? 'client' : 'source'));

    return <CodeBlock {...rest} language="json5">{JSON.stringify(configObj, null, 2)}</CodeBlock>
}

const WrappedFileExample = (props: FileProps) => {
    return <ErrorBoundary
        fallback={({error}) => (
            <div>
                <p>Example component crashed because of error: {error.message}.</p>
            </div>
        )}
    ><FileExample {...props} /></ErrorBoundary>
}

export default WrappedFileExample;
