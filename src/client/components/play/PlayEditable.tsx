import { useState, useEffect } from "react"
import { PlayData, type PlayInfoProps } from "./PlayData";
import { PlayEdit, type PlayEditProps } from "./PlayEdit";
import { useMutation } from "@tanstack/react-query";
import type { PlayObjectMinimal } from "../../../core/Atomic";
import ky from "ky";

export type PlayEditableProps = PlayInfoProps & PlayEditProps & {
    editable?: boolean
    defaultView?: 'view' | 'edit'
};

export const PlayEditable = (props: PlayEditableProps) => {

    const [mode, setMode] = useState<'view' | 'edit'>(props.defaultView ?? 'view');

    if(mode === 'view') {
        return <PlayData {...props} onEditClick={() => setMode('edit')}/>
    }

    return <PlayEdit onCancel={() => setMode('view')} context={props.context ?? 'edit'} initialPlay={props.final ?? props.play} {...props}/>
}

export const PlayEditableMutable = (props: PlayEditableProps & {uid: string, componentId: number}) => {

    const [mode, setMode] = useState<'view' | 'edit'>(props.defaultView ?? 'view');

    const {mutate, isPending, variables, isSuccess} = useMutation({
    mutationKey: ['playEdit', props.uid],
    mutationFn: (data: {play: Partial<PlayObjectMinimal<string>>}) => 
        ky.put(`api/components/${props.componentId}/plays/${props.uid}/play`,{
                json: data.play
            })
    });

    useEffect(() => {
        if(isSuccess) {
            setMode('view');
        }
    },[isSuccess, setMode]);

    if(mode === 'view') {
        return <PlayData {...props} onEditClick={() => setMode('edit')}/>
    }

    return <PlayEdit
    onCancel={() => setMode('view')}
    context={props.context ?? 'edit'}
    isSubmitting={isPending}
    onSubmit={(vals) => {
        console.debug(vals, 'Submitting modified play to api');
        mutate({play: vals})
    }}
    initialPlay={props.final ?? props.play}
    {...props}/>
}