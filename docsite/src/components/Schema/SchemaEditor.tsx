import React, { useEffect, useState, useMemo } from "react"
import BrowserOnly from "@docusaurus/BrowserOnly"
import { useColorMode } from '@docusaurus/theme-common';

const STRINGIFY_JSON = (json: unknown) => JSON.stringify(json, null, "\t");
import "../modern-json-react-styles.css";
import { JSONSchema, ReactJsonEditor, createAjvValidator, type Content, type Validator } from 'modern-react-json-editor';
import f from "ajv-formats"
import json5 from 'json5';

export interface SchemaEditorProps {
    config: object | string
    schema?: object
    height?: string
}

// based on https://github.com/jy95/docusaurus-json-schema-plugin/blob/main/testsite/src/components/PlaygroundInner.tsx
function SchemaEditorInner(props: SchemaEditorProps): JSX.Element {

    const validator: Validator | undefined = useMemo(() => {
        if(props.schema === undefined) {
            return undefined;
        }
        return createAjvValidator({
            schema: props.schema as JSONSchema,
            ajvOptions: {
                strict: "log",
                strictSchema: "log",
                allowUnionTypes: true,
            },
            onCreateAjv: (ajv) => {
                ajv.addKeyword('deprecationMessage');
                f.default(ajv);
                return ajv;
            }
        });
    }, [props.schema]);

    const initialData = useMemo(() => {
        let content: object;
        if(typeof props.config === 'string') {
            content = json5.parse(props.config);
        } else {
            content = props.config;
        }
        return {json: content};
    },[props.config])


   // const [data, setData] = useState({ json: props.config });

    const {
        colorMode, // the "effective" color mode, never null
    } = useColorMode();

    //const val = typeof props.config === 'object' ? STRINGIFY_JSON(props.config) : props.config;
    return (
            <ReactJsonEditor
                validator={validator}
                theme={colorMode}
                mode="text"
                content={initialData}
                style={{height: 'initial'}}
            />
    )
}

export default function SchemaEditor(props: SchemaEditorProps): JSX.Element {
    return (
        <BrowserOnly fallback={<div>Loading...</div>}>
            {() => {
                return <SchemaEditorInner {...props} />
            }}
        </BrowserOnly>
    )
}
