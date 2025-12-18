import React, {useEffect, useState} from "react"
import BrowserOnly from "@docusaurus/BrowserOnly"

//import './Explorer.scss';
import { JsonSchemaViewer } from 'cf-json-schema-viz';
import '../json-schema-viewer-styles.css'

export interface ExplorerProps {
    schema: object
}

// based on https://github.com/jy95/docusaurus-json-schema-plugin/blob/main/testsite/src/components/PlaygroundInner.tsx
export default function Explorer(props: ExplorerProps): JSX.Element {

    //injectStyles();

    return (
        <div>
            <JsonSchemaViewer
  schema={props.schema}
  renderRootTreeLines={true}
  emptyText="No schema defined"
  defaultExpandedDepth={0}
  markup
/>
        </div>
    )
}

// export default function PlaygroundComponent(): JSX.Element {
//     return (
//         <BrowserOnly fallback={<div>Loading...</div>}>
//             {() => {
//                 return <PlaygroundInner />
//             }}
//         </BrowserOnly>
//     )
// }
