import React, {useEffect, useState} from "react"
import BrowserOnly from "@docusaurus/BrowserOnly"

import Schema from "@site/static/aio.json";
import './Explorer.scss';
import './JsonSchemaViewer.scss';
import { JsonSchemaViewer } from "@stoplight/json-schema-viewer";
import {injectStyles, InlineStyles} from '@stoplight/mosaic';

export interface ExplorerProps {
    schema: object
}

// based on https://github.com/jy95/docusaurus-json-schema-plugin/blob/main/testsite/src/components/PlaygroundInner.tsx
export default function Explorer(props: ExplorerProps): JSX.Element {

    //injectStyles();

    return (
        <div>
            <JsonSchemaViewer
  name="Todos Model"
  schema={props.schema}
  expanded={false}
  hideTopBar={false}
  renderRootTreeLines={true}
  emptyText="No schema defined"
  defaultExpandedDepth={0}
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
