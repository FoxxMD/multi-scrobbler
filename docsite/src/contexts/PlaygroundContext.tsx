import { useContext, createContext } from "react"

// Type I need for useRef
import type { MonacoEditorTypes } from "@theme/MonacoEditor"

export type State = {
    // The full schema
    // We might need to scope it with a JSON Pointer
    fullSchema: unknown
    // The current schema displayed (after the json pointer)
    userSchema: unknown
    // The current json pointer
    jsonPointer: string
    // Schema editor ref
    schemaRef: undefined | MonacoEditorTypes.IStandaloneCodeEditor
    // Data editor ref
    editorRef: undefined | MonacoEditorTypes.IStandaloneCodeEditor
    // Data on the data editor
    // When using "Infer schema from data", it would be annoying to lose our written
    data: string
    // Errors in schema
    schemaErrors: MonacoEditorTypes.IMarkerData[]
    // Errors in data
    dataErrors: MonacoEditorTypes.IMarkerData[]
}

export type Playground = {
    // state
    state: State
    // update function
    updateState: (_: Partial<State>) => void
}

export const PlaygroundContext = createContext<Playground>({
    state: {
        fullSchema: {},
        userSchema: {},
        jsonPointer: "",
        data: "{}",
        schemaRef: undefined,
        editorRef: undefined,
        schemaErrors: [],
        dataErrors: [],
    },
    updateState: () => {},
})

export const usePlaygroundContext = () => useContext(PlaygroundContext)

export const PlaygroundContextProvider = PlaygroundContext.Provider
