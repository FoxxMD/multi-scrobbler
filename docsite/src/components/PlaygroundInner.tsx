import React from "react"
import BrowserOnly from "@docusaurus/BrowserOnly"

import Schema from "@site/static/aio.json";
import ConfigExample from "@site/static/configExample.json";
import JSONSchemaViewer from "@theme/JSONSchemaViewer"
import JSONSchemaEditor from "@theme/JSONSchemaEditor";
import {useColorMode} from "@docusaurus/theme-common";
const STRINGIFY_JSON = (json: unknown) => JSON.stringify(json, null, "\t")

// based on https://github.com/jy95/docusaurus-json-schema-plugin/blob/main/testsite/src/components/PlaygroundInner.tsx
function PlaygroundInner(): JSX.Element {

    const { colorMode } = useColorMode()

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
                <JSONSchemaViewer
                    schema={Schema}
                    showExamples={true}
                />
                </div>
                <div style={{ boxSizing: "border-box", width: "50%" }}>
                <JSONSchemaEditor
                    value={STRINGIFY_JSON(ConfigExample)}
                    theme={colorMode === "dark" ? "vs-dark" : "vs"}
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
