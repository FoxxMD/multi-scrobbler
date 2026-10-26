import React, { Fragment, useMemo, useRef, useEffect } from "react"
import CodeBlock, { Props as CodeBlockProps } from '@theme/CodeBlock';
import ErrorBoundary from "@docusaurus/ErrorBoundary"
import { useTypedLocalStorage } from "./useLocalStorage";
import ButtonGroup from "./ButtonGroup";
import EditorFetch from '@site/src/components/Schema/SchemaEditorFetch';
import {useWindowSize} from '@docusaurus/theme-common';

export interface FileProps extends Omit<CodeBlockProps, 'children'> {
    /**
     * The plain code block is rendered at build time next to this island (inside a `.file-example` wrapper)
     * instead of by React. The island only toggles `data-mode` on the wrapper.
     * (Island children can't be used: Starlight's <Tabs> drops <template> slot content.)
     */
    externalPlain?: boolean
    data: string | object
    filePathName?: string
    schemaName?: string
    interactive?: boolean
    defaultDisplay?: 'plain' | 'interactive'
    readOnlyAtWidth?: number
}

const FileExample = (props: FileProps) => {
    const {
        data,
        interactive = true,
        defaultDisplay = 'interactive',
        schemaName,
        filePathName,
        readOnlyAtWidth = 1,
        externalPlain = false,
        ...rest
    } = props;

    const [fileExampleShow, setFileExampleShow] = useTypedLocalStorage('docusaurus.tab.fileExampleShow', defaultDisplay, false);

    const windowSize = useWindowSize({desktopBreakpoint: readOnlyAtWidth});

    let displaySwitch = null;

    const isInteractive = interactive && windowSize === 'desktop'

    if (isInteractive) {
        displaySwitch = (
            <ButtonGroup
                options={[['plain', 'Plain'], ['interactive', 'Interactive']]}
                defaultValue={defaultDisplay}
                value={fileExampleShow}
                variant="primary"
                size="medium"
                onChange={(val) => setFileExampleShow(val as 'interactive' | 'plain')}
            />
        );
    }

    let fileNameContent = null;
    if(filePathName !== undefined && (isInteractive && fileExampleShow === 'interactive')) {
        fileNameContent = <code style={{float: 'right', paddingRight: '0.5em', paddingLeft: '0.5em'}}>{filePathName}</code>
    }

    let header = null;
    if(displaySwitch !== null || fileNameContent !== null) {
        header = (
        <div style={{marginBottom: '1em'}}>
            {displaySwitch}{fileNameContent}
        </div>
        );
    }

    const codeBlockContent = useMemo(() =>{
        if(isInteractive && fileExampleShow === 'interactive') {
            return null;
        }
        if(typeof data !== 'string') {
            return JSON.stringify(data, null, 2);
        }
        return data;
    }, [interactive, fileExampleShow, data]);

    const ref = useRef<HTMLDivElement>(null);
    const showInteractive = isInteractive && fileExampleShow === 'interactive';
    useEffect(() => {
        const wrapper = ref.current?.closest<HTMLElement>('.file-example');
        if (externalPlain && wrapper) wrapper.dataset.mode = showInteractive ? 'interactive' : 'plain';
    }, [externalPlain, showInteractive]);

    return (<div ref={ref}>
        {header}
        {!externalPlain && (!isInteractive || fileExampleShow === 'plain') ? <CodeBlock title={filePathName} language="json5">{codeBlockContent}</CodeBlock> : null}
        {isInteractive && fileExampleShow === 'interactive' ? <EditorFetch configContent={data} schemaName={schemaName}/> : null}
        </div>
    );
}

const WrappedFileExample = (props: FileProps) => {
    return <ErrorBoundary
        fallback={({ error }) => (
            <div>
                <p>Example component crashed because of error: {error.message}.</p>
            </div>
        )}
    ><FileExample {...props} /></ErrorBoundary>
}

export default WrappedFileExample;
