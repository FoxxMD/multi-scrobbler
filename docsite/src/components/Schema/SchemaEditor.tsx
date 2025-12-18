import React, {useEffect, useState} from "react"
import BrowserOnly from "@docusaurus/BrowserOnly"

import JSONSchemaEditor from "@theme/JSONSchemaEditor";
//import {useColorMode} from "@docusaurus/theme-common";
const STRINGIFY_JSON = (json: unknown) => JSON.stringify(json, null, "\t");

export interface SchemaEditorProps {
    config: object | string
    schema: object
    height?: string
}

// based on https://github.com/jy95/docusaurus-json-schema-plugin/blob/main/testsite/src/components/PlaygroundInner.tsx
function SchemaEditorInner(props: SchemaEditorProps): JSX.Element {

    const [theme, setTheme] = useState('vs-dark');

    useEffect(() => {
      const theme = document.getElementsByTagName("html")[0].getAttribute('data-theme');
      setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
    }, [setTheme]);
    

    //debugger;
    const val = typeof props.config === 'object' ? STRINGIFY_JSON(props.config) : props.config;
    return (
        <div>
            <JSONSchemaEditor
                    value={val}
                    theme={theme}
                    schema={props.schema}
                    height={props.height ?? "70vh"}
                />
        </div>
    )
}

export default function SchemaEditor(props: SchemaEditorProps): JSX.Element {
    return (
        <BrowserOnly fallback={<div>Loading...</div>}>
            {() => {
                return <SchemaEditorInner {...props}/>
            }}
        </BrowserOnly>
    )
}
