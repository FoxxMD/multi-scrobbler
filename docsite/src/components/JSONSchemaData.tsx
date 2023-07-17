import React from "react"
import BrowserOnly from "@docusaurus/BrowserOnly"
import { useColorMode } from "@docusaurus/theme-common"

import JSONSchemaEditor from "@theme/JSONSchemaEditor"
// Context
import { usePlaygroundContext } from "@site/src/contexts/PlaygroundContext"

// Common stringify of the JSON
const STRINGIFY_JSON = (json: unknown) => JSON.stringify(json, null, "\t")

function JSONSchemaDataInner(): JSX.Element {
    const {
        state: { userSchema, editorRef, data: value },
        updateState,
    } = usePlaygroundContext()

    const { colorMode } = useColorMode()

    return (
        <div style={{ boxSizing: "border-box", width: "50%" }}>
            <JSONSchemaEditor
                value={value}
                schema={userSchema}
                theme={colorMode === "dark" ? "vs-dark" : "vs"}
                editorDidMount={(editor) => {
                    updateState({ editorRef: editor })
                }}
                height={"70vh"}
                key={STRINGIFY_JSON(userSchema)}
            />
        </div>
    )
}

export default function JSONSchemaDataComponent(): JSX.Element {
    return (
        <BrowserOnly fallback={<div>Loading...</div>}>
            {() => {
                return <JSONSchemaDataInner />
            }}
        </BrowserOnly>
    )
}
