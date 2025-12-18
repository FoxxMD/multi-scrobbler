import React, {useEffect, useState, Fragment} from "react"

import useBaseUrl from '@docusaurus/useBaseUrl';
import SchemaEditor from "./SchemaEditor";
import json5 from 'json5';

export interface SchemdEditorFetchProps {
    configName?: string
    configContent?: string
    schemaName: string
}

export default function ExplorerFetchFunc(props: SchemdEditorFetchProps): JSX.Element {

    const [schema, setSchema] = useState(undefined as undefined | Error | object);
    const [config, setConfig] = useState(undefined as undefined | Error | object);

    const schemaUrl = useBaseUrl(`/${props.schemaName}.json`);
    const configUrl = props.configName !== undefined ? useBaseUrl(`/${props.configName}.json`) : undefined;

    useEffect( () => {
        fetch(
            schemaUrl,
            {
                headers: {
                    'Accept': 'application/json',
                }
            }
        )
            .then((response) => response.json())
            .then((data) => setSchema(data))
            .catch( (err) => setSchema(err) )
    }, [setSchema, schemaUrl])

    useEffect( () => {
        if(configUrl !== undefined) {
            fetch(
                configUrl,
                {
                    headers: {
                        'Accept': 'application/json',
                    }
                }
            )
                .then((response) => response.json())
                .then((data) => setConfig(data))
                .catch( (err) => setConfig(err) )
        } else if(props.configContent !== undefined) {
            if(typeof props.configContent === 'string') {
                setConfig(json5.parse(props.configContent));
            } else {
                setConfig(props.configContent);
            }
        }
    }, [setConfig, configUrl, props.configContent])

    return (
        <Fragment>
        {schema === undefined || config === undefined && <div>Loading ...</div>}
        {schema !== undefined && schema instanceof Error && <div>Houston we have a problem : {schema.message}</div>}
        {config !== undefined && config instanceof Error && <div>Houston we have a problem : {config.message}</div>}
            {schema !== undefined && !(schema instanceof Error) && config !== undefined && !(config instanceof Error) && <SchemaEditor schema={schema} config={config}/>}
            </Fragment>
    )
}