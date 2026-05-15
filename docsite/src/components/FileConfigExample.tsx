import React, { Fragment, useMemo } from "react"
import CodeBlock, {Props as CodeBlockProps} from '@theme/CodeBlock';
import Admonition from '@theme/Admonition';
import ErrorBoundary from "@docusaurus/ErrorBoundary"
import json5 from 'json5';
import FileExample, { FileProps } from "./FileExample";

export interface FileConfigProps extends FileProps {
    data: string
    name: string
    configureAs?: 'client' | 'source'
    aio?: boolean
    filePathName?: string
}

const FileConfigExample = (props: FileConfigProps) => {
    const {
        data,
        configureAs = 'source',
        aio = false,
        name,
        ...rest
    } = props;

    let configObj;
    // eslint-disable-next-line prefer-const
    try {
        configObj = json5.parse(data) as object[];
    } catch (e) {
        console.error(new Error(`Unable to parse content for ${aio === true ? 'aio ' :''}${name}`, {cause: e}));
        return <Admonition type="danger" title="Unexpected Error">
            <p>Example component crashed because of error!</p>
            <CodeBlock>{e.message}</CodeBlock>
        </Admonition>
    }

    const transformed = useMemo(() => {
        let content: object;
        if(typeof data === 'string') {
            try {
            content = json5.parse(data);
            } catch (e) {
                console.error(new Error(`Unable to parse transformed content for ${aio === true ? 'aio ' :''}${name}`, {cause: e}));
            }
        } else {
            content = data;
        }
        if(configureAs !== undefined && Array.isArray(content)) {
            const filtered = content.filter(x => x.configureAs === undefined || x.configureAs === configureAs);
            if(aio) {
                const configType = configureAs === 'client' ? 'clients' : 'sources';
                content = {[configType]: filtered.map(x => ({...x, type: name}))}
            } else {
                content = filtered;
            }
        }
        return content;
    },[data, configureAs, aio, name])

    configObj = configObj.filter(x => x.configureAs === undefined || x.configureAs === configureAs);

    return <FileExample data={transformed} {...rest}/>
}

const WrappedFileConfigExample = (props: FileConfigProps) => {
    return <ErrorBoundary
        fallback={({error}) => (
            <div>
                <p>Example component crashed because of error: {error.message}.</p>
            </div>
        )}
    ><FileConfigExample {...props} /></ErrorBoundary>
}

export default WrappedFileConfigExample;
