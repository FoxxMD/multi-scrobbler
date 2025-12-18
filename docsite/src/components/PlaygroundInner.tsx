import React, {useEffect, useState} from "react"
import BrowserOnly from "@docusaurus/BrowserOnly"
import {useColorMode} from '@docusaurus/theme-common';

import Schema from "@site/static/aio.json";
import ConfigExample from "@site/static/configExample.json";
import './Playground.scss';
import { JsonSchemaViewer } from 'cf-json-schema-viz';
import "./json-schema-viewer-styles.css";
import "./modern-json-react-styles.css";
import { ReactJsonEditor, createAjvValidator, type Content  } from 'modern-react-json-editor';
import f from "ajv-formats"

const validator = createAjvValidator({
     schema: Schema,
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

function PlaygroundInner(): JSX.Element {

      const {
    colorMode, // the "effective" color mode, never null
    // colorModeChoice, // the color mode chosen by the user, can be null
    // setColorMode, // set the color mode chosen by the user
  } = useColorMode();

    const [data, setData] = useState<Content>({json: ConfigExample });

    return (
            <div className="schemaWrapper2">
                <div style={{ padding: '0 1em 0 1em', flexBasis: 'min-content', flexGrow: 2}}>
                <JsonSchemaViewer
  name="Todos Model"
  schema={Schema}
  expanded={false}
  hideTopBar={false}
  renderRootTreeLines={true}
  emptyText="No schema defined"
  defaultExpandedDepth={0}
  markup
/>
                </div>
                <div className="fileEditor2" style={{ flexBasis: 'auto', flexGrow: 3 }}>
    <ReactJsonEditor 
    validator={validator} 
    theme={colorMode} 
    content={data}
     />
               
                </div>
            </div>
    )
}

export default function PlaygroundComponent(): JSX.Element {
    return (
        <BrowserOnly fallback={<div>Loading...</div>}>
            {() => {
                return <PlaygroundInner />
            }}
        </BrowserOnly>
    )
}
