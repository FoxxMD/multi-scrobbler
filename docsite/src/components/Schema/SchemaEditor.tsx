import React, {useEffect, useState, useMemo} from "react"
import BrowserOnly from "@docusaurus/BrowserOnly"
import {useColorMode} from '@docusaurus/theme-common';

const STRINGIFY_JSON = (json: unknown) => JSON.stringify(json, null, "\t");
import "../modern-json-react-styles.css";
import { ReactJsonEditor, createAjvValidator, type Content  } from 'modern-react-json-editor';
import f from "ajv-formats"

export interface SchemaEditorProps {
    config: object | string
    schema: object
    height?: string
}

// based on https://github.com/jy95/docusaurus-json-schema-plugin/blob/main/testsite/src/components/PlaygroundInner.tsx
function SchemaEditorInner(props: SchemaEditorProps): JSX.Element {

    const validator = useMemo(() => {
      return createAjvValidator({
     schema: props.schema,
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
    },[props.schema]);


    const [data, setData] = useState({json: props.config });

      const {
    colorMode, // the "effective" color mode, never null
  } = useColorMode();
    
    const val = typeof props.config === 'object' ? STRINGIFY_JSON(props.config) : props.config;
    return (
        <div>
        <ReactJsonEditor 
        validator={validator} 
        theme={colorMode} 
        content={data}
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
