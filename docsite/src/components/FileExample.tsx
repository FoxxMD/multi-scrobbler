import React, { Fragment, useMemo } from "react"
import CodeBlock, { Props as CodeBlockProps } from '@theme/CodeBlock';
import Admonition from '@theme/Admonition';
import ErrorBoundary from "@docusaurus/ErrorBoundary"
import Error from "@theme/Error"
import { Simulate } from "react-dom/test-utils";
import { useTypedLocalStorage } from "./useLocalStorage";
import ButtonGroup from "./ButtonGroup";
import EditorFetch from '@site/src/components/Schema/SchemaEditorFetch';

export interface FileProps extends Omit<CodeBlockProps, 'children'> {
    data: string | object
    filePathName?: string
    schemaName?: string
    interactive?: boolean
    defaultDisplay?: 'plain' | 'interactive'
}

const FileExample = (props: FileProps) => {
    const {
        data,
        interactive = true,
        defaultDisplay = 'interactive',
        schemaName,
        filePathName,
        ...rest
    } = props;

    const [fileExampleShow, setFileExampleShow] = useTypedLocalStorage('docusaurus.tab.fileExampleShow', defaultDisplay, false);

    let displaySwitch = null;

    if (interactive) {
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
    if(filePathName !== undefined && (!interactive || fileExampleShow === 'interactive')) {
        fileNameContent = <code style={{float: 'right', paddingRight: '0.5em', paddingLeft: '0.5em'}}>{filePathName}</code>
    }

    let header = null;
    if(displaySwitch !== null || filePathName !== null) {
        header = (
        <div style={{marginBottom: '1em'}}>
            {displaySwitch}{fileNameContent}
        </div>
        );
    }

    const codeBlockContent = useMemo(() =>{
        if(interactive && fileExampleShow === 'interactive') {
            return null;
        }
        if(typeof data !== 'string') {
            return JSON.stringify(data, null, 2);
        }
        return data;
    }, [interactive, fileExampleShow, data]);

    return (<Fragment>
        {header}
        {!interactive || fileExampleShow === 'plain' ? <CodeBlock title={filePathName} language="json5">{codeBlockContent}</CodeBlock> : null}
        {interactive && fileExampleShow === 'interactive' ? <EditorFetch configContent={data} schemaName={schemaName}/> : null}
        </Fragment>
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
