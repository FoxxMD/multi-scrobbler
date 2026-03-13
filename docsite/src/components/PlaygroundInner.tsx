import React, {useEffect, useState} from "react"
import BrowserOnly from "@docusaurus/BrowserOnly"
import {useColorMode} from '@docusaurus/theme-common';

import Schema from "@site/static/schemas/aio.json";
import ConfigExample from "@site/static/configExample.json";
import './Playground.scss';
import { JsonSchemaViewer } from 'cf-json-schema-viz';
import "./json-schema-viewer-styles.css";
import "./modern-json-react-styles.css";
import { ReactJsonEditor, createAjvValidator, type Content  } from 'modern-react-json-editor';
import f from "ajv-formats"
import DetailsAdmo from "./AdmonitionDetails";

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
                <DetailsAdmo type="note" summary="Config Structure">
                    <p>This displays the <strong>structure</strong> of the <a href="/configuration?configType=aio#configuration-types">all-in-one (<code>config.json</code>) configuration</a> with all possible properties, their shape, and descriptions/types.</p>
                    
                    <p>Use this to understand how to write a valid config.</p>
                </DetailsAdmo>
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
                    <DetailsAdmo type="note" summary="Config Example">
                    <p>
                        This displays an <strong>example config file</strong> of a <a href="/configuration?configType=aio#configuration-types">all-in-one (<code>config.json</code>) configuration</a>  that adheres to the shown <strong>Config Structure.</strong>
                    </p>

                    <ul>
                        <li>
                            <strong>text</strong> mode lets you edit the JSON directly.
                        </li>
                        <li>
                            <strong>tree</strong> mode gives you a guided point-and-click editing experience that always keeps the JSON <i>syntax</i> valid.
                        </li>
                    </ul>

                    <p>Both modes <strong>validate</strong> that the configuraion is correct. Any errors show up as squiggly lines.</p>

                    <p>After you finish editing, switch to <strong>text</strong> and then copy all text to get a completed config.</p>
                </DetailsAdmo>
    <ReactJsonEditor 
    validator={validator} 
    theme={colorMode} 
    content={data}
    style={{height: 'initial'}}
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
