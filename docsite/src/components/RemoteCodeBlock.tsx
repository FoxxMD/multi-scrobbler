import React, {useEffect, useState, Fragment} from "react"
import CodeBlock, { Props as CodeBlockProps } from '@theme/CodeBlock';
import {extractSnippet} from '../Utils';

export interface SchemaEditorFetchProps extends CodeBlockProps {
    url: string
    ranges?: [number, number][]
    prefix?: string
    suffix?: string
    interstitial?: string
}

export const RemoteCodeBlock = (props: SchemaEditorFetchProps) => {

    const {
        url,
        ranges,
        interstitial = '',
        prefix,
        suffix,
        ...rest
    } = props;

    const [content, setContent] = useState(undefined as undefined | Error | string);

    //const configUrl = props.configName !== undefined ? useBaseUrl(`/${props.configName}.json`) : undefined;
    useEffect( () => {
        fetch(
                url
            )
                .then(async (response) => {
                    if(response.body === null) {
                        throw new Error('No body returned in response');
                    }
                    if(ranges === undefined) {
                        return [await response.text()];
                    }
                    return await extractSnippet(response.body, ranges);
                })
                .then((data: string[]) => {
                    const parts: string[] = [];
                    if(prefix !== undefined) {
                        parts.push(prefix);
                    }
                    const iString = interstitial === '' ? '\n' : `\n${interstitial}\n`;
                    parts.push(data.join(iString));
                    if(suffix !== undefined) {
                        parts.push(suffix);
                    }
                    setContent(parts.join('\n'));
                })
                .catch( (err) => setContent(err) )
    }, [setContent, url, ranges,prefix, suffix, interstitial]);



    return (
        <Fragment>
        {content === undefined && <div>Loading ...</div>}
        {content !== undefined && content instanceof Error && <div>Houston we have a problem : {typeof content === 'string' ? content : content.message}</div>}
            {content !== undefined && !(content instanceof Error) && 
            <CodeBlock {...rest}>{content}</CodeBlock>}
            </Fragment>
    )
}