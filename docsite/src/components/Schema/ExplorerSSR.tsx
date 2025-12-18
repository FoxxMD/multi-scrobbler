import Schema from "@site/static/aio.json";
import Explorer from './Explorer';

export default function ExplorerSSR(): JSX.Element {

    return <Explorer schema={Schema}/>
}