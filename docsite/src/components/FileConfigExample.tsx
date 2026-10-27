import React, { Fragment, useMemo } from "react"
import PlainCode from './PlainCode';
import Aside from './Aside';
import ErrorBoundary from "./ErrorBoundary"
import json5 from 'json5';
import FileExample, { FileProps } from "./FileExample";
import { transformConfig } from './configTransform';

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
        configObj = json5.parse(data) as { configureAs?: string }[];
    } catch (e) {
        console.error(new Error(`Unable to parse content for ${aio === true ? 'aio ' :''}${name}`, {cause: e}));
        return <Aside type="danger" title="Unexpected Error">
            <p>Example component crashed because of error!</p>
            <PlainCode>{(e as Error).message}</PlainCode>
        </Aside>
    }

    const transformed = useMemo(() => transformConfig(data, configureAs, aio, name), [data, configureAs, aio, name])

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
