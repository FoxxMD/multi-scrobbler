import React, {useEffect, useState} from "react"
import BrowserOnly from "@docusaurus/BrowserOnly"

import Schema from "@site/static/aio.json";
import ConfigExample from "@site/static/configExample.json";
import JSONSchemaEditor from "@theme/JSONSchemaEditor";
import './Playground.scss';
//import {useColorMode} from "@docusaurus/theme-common";
import { JsonSchemaViewer } from "@stoplight/json-schema-viewer";
import {injectStyles} from '@stoplight/mosaic';
const STRINGIFY_JSON = (json: unknown) => JSON.stringify(json, null, "\t");

// based on https://github.com/jy95/docusaurus-json-schema-plugin/blob/main/testsite/src/components/PlaygroundInner.tsx
function PlaygroundInner(): JSX.Element {

    injectStyles();

    const [theme, setTheme] = useState('vs-dark');

    useEffect(() => {
      const theme = document.getElementsByTagName("html")[0].getAttribute('data-theme');
      console.log(theme);
      setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
    }, [setTheme]);

    //debugger;
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                overflowY: "hidden",
                overflowX: "hidden",
            }}
        >
            <div
                style={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "space-between",
                }}
            >
                <div style={{width: '50%'}}>
                {/* <JSONSchemaViewer
                    schema={Schema}
                    showExamples={true}
                /> */}
                <JsonSchemaViewer
  name="Todos Model"
  schema={Schema}
  expanded={false}
  hideTopBar={false}
  renderRootTreeLines={true}
  emptyText="No schema defined"
  defaultExpandedDepth={0}
/>
                </div>
                <div style={{ boxSizing: "border-box", width: "50%" }}>
                <JSONSchemaEditor
                    value={STRINGIFY_JSON(ConfigExample)}
                    theme={theme}
                    schema={Schema}
                    height={"70vh"}
                />
                </div>
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
