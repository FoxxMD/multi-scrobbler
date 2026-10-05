import { useState } from "react"
import { PlayData, type PlayInfoProps } from "./PlayData";
import { PlayEdit, type PlayEditProps } from "./PlayEdit";

export type PlayEditableProps = PlayInfoProps & PlayEditProps & {
    editable?: boolean
    defaultView?: 'view' | 'edit'
};

export const PlayEditable = (props: PlayEditableProps) => {

    const [mode, setMode] = useState<'view' | 'edit'>(props.defaultView ?? 'view');

    if(mode === 'view') {
        return <PlayData {...props}/>
    }

    return <PlayEdit context={props.context ?? 'edit'} initialPlay={props.final ?? props.play} {...props}/>
}