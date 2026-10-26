import React, {PropsWithChildren, Fragment} from "react"

export interface SchemaLinkProps {
    objectName: string
    lower?: boolean
    client?: boolean
}

const sourceURL = 'https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fsource.json';
const clientURL = 'https%3A%2F%2Fraw.githubusercontent.com%2FFoxxMD%2Fmulti-scrobbler%2Fmaster%2Fsrc%2Fbackend%2Fcommon%2Fschema%2Fclient.json';

const SchemaLink = (props: PropsWithChildren<SchemaLinkProps>) => {
    const {
        children,
        lower,
        client = false
    } = props;
    let content = children;
    if(content === undefined) {
        content = <Fragment>{lower ? 'explore' : 'Explore'} the schema with an example and live editor/validator</Fragment>
    }
    const definition = `https://json-schema.app/view/%23/%23%2Fdefinitions%2F${props.objectName}`;
    const url = client ? clientURL : sourceURL;
 return <a target="_blank" href={`${definition}?url=${url}`}>{content}</a>
}

export default SchemaLink;
