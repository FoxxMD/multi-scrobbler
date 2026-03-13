import React, {useEffect, useState, Fragment} from "react"
//import BrowserOnly from "@docusaurus/BrowserOnly"

import Explorer from './Explorer';
import useBaseUrl from '@docusaurus/useBaseUrl';

export interface ExplorerFetchProps {
    name: string
}

export default function ExplorerFetchFunc(props: ExplorerFetchProps): JSX.Element {

    const [schema, setSchema] = useState(undefined as undefined | Error | object);

    const url = useBaseUrl(`/${props.name}.json`);

    useEffect( () => {
        fetch(
            url,
            {
                headers: {
                    'Accept': 'application/json',
                }
            }
        )
            .then((response) => response.json())
            .then((data) => setSchema(data))
            .catch( (err) => setSchema(err) )
    }, [setSchema, url])

    return (
        <Fragment>
        {schema === undefined && <div>Loading ...</div>}
        {schema !== undefined && schema instanceof Error && <div>Houston we have a problem : {schema.message}</div>}
            {schema !== undefined && !(schema instanceof Error) && <Explorer schema={schema}/>}
            </Fragment>
    )
}

// export default function ExplorerFetch(props: ExplorerFetchProps): JSX.Element {
//     return (
//         <BrowserOnly fallback={<div>Loading...</div>}>
//             {() => {
//                 return <ExplorerFetchFunc {...props} />
//             }}
//         </BrowserOnly>
//     )
// }
