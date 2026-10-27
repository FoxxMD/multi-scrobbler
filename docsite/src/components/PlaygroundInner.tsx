import React, {useEffect, useState} from "react"
import {useColorMode, useWindowSize} from './theme';
import PlainCode from './PlainCode';

import Schema from "@site/public/schemas/aio.json";
import ConfigExample from "@site/public/configExample.json";
import './Playground.scss';
import { JSONSchema, JsonSchemaViewer } from 'cf-json-schema-viz';
import "./json-schema-viewer-styles.css";
import "./modern-json-react-styles.css";
import { Mode, ReactJsonEditor, createAjvValidator, type Content  } from 'modern-react-json-editor';
import f from "ajv-formats"
import Ajv2020 from 'ajv/dist/2020';
import DetailsAdmo from "./DetailsAdmo";
import { withBase } from "../withBase";

const validator = createAjvValidator({
     schema: Schema,
     ajvOptions: {
        strict: "log",
        strictSchema: "log",
        allowUnionTypes: true,
     },
    onCreateAjv: (ajv) => {
            const a = new Ajv2020();
            a.addKeyword('deprecationMessage');
            a.addKeyword('zockerId');
            f.default(a);
            return a;
    }
});

function PlaygroundInner(): JSX.Element {

      const {
    colorMode, // the "effective" color mode, never null
    // colorModeChoice, // the color mode chosen by the user, can be null
    // setColorMode, // set the color mode chosen by the user
  } = useColorMode();
  const windowSize = useWindowSize({desktopBreakpoint: 500});

    const [data, setData] = useState<Content>({json: ConfigExample });

    return (
            <div className="schemaWrapper2">
                <div style={{ padding: '0 1em 0 1em', flexBasis: 'min-content', flexGrow: 2}}>
                <DetailsAdmo type="note" summary="Config Structure">
                    <p>This displays the <strong>structure</strong> of the <a href={withBase("configuration/?configType=aio#configuration-types")}>all-in-one (<code>config.json</code>) configuration</a> with all possible properties, their shape, and descriptions/types.</p>
                    
                    <p>Use this to understand how to write a valid config.</p>
                </DetailsAdmo>
<div className="not-content">
                <JsonSchemaViewer
                schema={Schema as JSONSchema}
                // expanded={false}
                // hideTopBar={false}
                renderRootTreeLines={true}
                emptyText="No schema defined"
                defaultExpandedDepth={0}
                markup
                />
                </div>
                </div>
                <div style={{ flexBasis: 'auto', flexGrow: 3 }}>
                    <div className="fileEditor2">
                    <DetailsAdmo type="note" summary="Config Example">
                    <p>
                        This displays an <strong>example config file</strong> of a <a href={withBase("configuration/?configType=aio#configuration-types")}>all-in-one (<code>config.json</code>) configuration</a>  that adheres to the shown <strong>Config Structure.</strong>
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
                </div>
                <div className="fileEditorMobile2">
                <DetailsAdmo type="warning" summary="Config Example Mobile Experience">
                    <p>
                        This displays an <strong>example config file</strong> of a <a href={withBase("configuration/?configType=aio#configuration-types")}>all-in-one (<code>config.json</code>) configuration</a>  that adheres to the shown <strong>Config Structure.</strong>
                    </p>
                    <p>
                        The example config file editor is meant for a larger screen experience so <strong>only the read-only example is shown.</strong> Please use this site on a tablet/laptop/desktop to enable file editor features.
                    </p>
                </DetailsAdmo>
                </div>
                {windowSize === 'mobile' ? (<PlainCode title={`CONFIG/config.json`} language="json5">{JSON.stringify(data, null, 2)}</PlainCode>) : (
<div className="not-content">
                        <ReactJsonEditor 
    validator={validator} 
    theme={colorMode} 
    content={data}
    mode={"text" as Mode.text}
    style={{height: 'initial'}}
     />
                        </div>
                )}
                </div>
            </div>
            
    )
}

export default function PlaygroundComponent(): JSX.Element {
    return (
        <PlaygroundInner />
    )
}
