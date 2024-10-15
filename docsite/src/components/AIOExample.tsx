import React, { Fragment } from "react"
import CodeBlock from '@theme/CodeBlock';
import Admonition from '@theme/Admonition';
import ErrorBoundary from "@docusaurus/ErrorBoundary"
import Error from "@theme/Error"
import { Simulate } from "react-dom/test-utils";
import error = Simulate.error;
import json5 from 'json5';

export interface AIOProps {
    data: string
    client?: boolean
    name: string
}

const AIOExample = (props: AIOProps) => {
    const {
        data,
        name,
        client = false
    } = props;

    let configObj;
    // eslint-disable-next-line prefer-const
    try {
        configObj = json5.parse(data);
    } catch (e) {
        console.error(e);
        return <Admonition type="danger" title="Unexpected Error">
            <p>Example component crashed because of error!</p>
            <CodeBlock>{e.message}</CodeBlock>
        </Admonition>
    }
    configObj[0].type = name;
    const configType = client ? 'clients' : 'sources';

    const aio = {[configType]: configObj};
    return <CodeBlock title="CONFIG_DIR/config.json" language="json5">{JSON.stringify(aio, null, 2)}</CodeBlock>
}

const WrappedAIOExample = (props: AIOProps) => {
    return <ErrorBoundary
        fallback={({error}) => (
            <div>
                <p>Example component crashed because of error: {error.message}.</p>
            </div>
        )}
    ><AIOExample {...props} /></ErrorBoundary>
}

export default WrappedAIOExample;
