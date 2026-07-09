import { Badge, HStack, Separator } from "@chakra-ui/react";
import { useSSEContext, useSSEEvent } from "@flamefrontend/sse-runtime-react";
import React, { type ComponentProps, type PropsWithChildren, useCallback, useEffect, useState } from "react";
import { useTimeout } from 'react-use-timeout';
import { COMPONENT_STATE, type ComponentCommonApiJson, componentStateToFriendly, type MsSseEvent, type PlayApiCommon } from "../../core/Api";
import { type Second } from "../../core/Atomic";
import { capitalizeWords } from "../../core/StringUtils";

export const PlayStateBadge = (props: PropsWithChildren<ComponentProps<typeof Badge>> & { state: PlayApiCommon['state'], suffix?: React.JSX.Element, hasDeadQueue?: boolean }) => {

  const { state, suffix, children, ...rest } = props;

  let badgeColor = undefined;
  let badgeText = capitalizeWords(state);

  switch (state) {
    case 'queued':
      badgeColor = 'gray';
      break;
    case 'scrobbled':
    case 'discovered':
      badgeColor = 'green';
      break;
    case 'failed':
    case ('dead queued' as PlayApiCommon['state']): 
      badgeColor = 'red';
      if(props.hasDeadQueue) {
        badgeText = 'Dead Queued';
      }
      break;
    case 'discarded':
      badgeColor = 'grey';
      break;
    case 'duped':
      badgeColor = 'orange';
      break;
  }

  return <Badge variant="surface" colorPalette={badgeColor} {...rest}>{children ?? badgeText}{suffix}</Badge>
}

const DEFAULT_EXPIRES = 10000;

export const NewBadge = (props: ComponentProps<typeof Badge>) => <Badge variant="surface" colorPalette="blue" {...props}/>;

export const EphemeralElement = (props: { expires?: Second | boolean, children: React.ReactNode }) => {

    const {
        expires = DEFAULT_EXPIRES,
        children
    } = props;
    let expiresTime: Second | undefined;
    if(expires === true) {
        expiresTime = DEFAULT_EXPIRES;
    } else if(expires !== false) {
        expiresTime = expires;
    }
    const [shouldShow, setShouldShow] = useState<boolean>(true);
    const hide = useCallback(() => {
        setShouldShow(false);

    }, [setShouldShow]);
    const hideTimeout = useTimeout(hide, expiresTime ?? DEFAULT_EXPIRES);
    useEffect(() => {
        if (expiresTime !== undefined) {
            hideTimeout.start();
        }
    }, []);

    if (shouldShow) {
        return children;
    }
    return null;
}

export const ComponentStateBadge = (props: ComponentProps<typeof Badge> & {
    data: Pick<ComponentCommonApiJson, 'state'>,
    componentId?: number,
    live?: boolean,
    separator?: boolean | React.JSX.Element,
    suffix?: React.JSX.Element
}) => {

    const { data, suffix, separator, ...rest } = props;

    const [componentState, setComponentState] = useState(data.state);

    useEffect(() =>{
        setComponentState(data.state);
    },[data.state, setComponentState]);

    const client = useSSEContext<MsSseEvent>();
    const connection = useSSEEvent(client, 'componentUpdate', (payload) => {
        if(props.componentId !== undefined && props.live && payload.componentId === props.componentId && payload.data.state !== undefined) {
            setComponentState(payload.data.state);
        }
    });

    let badgeColor = undefined;

    switch (componentState) {
        case COMPONENT_STATE.STOPPED:
            badgeColor = 'gray';
            break;
        case COMPONENT_STATE.RUNNING:
            badgeColor = 'green';
            break;
        case COMPONENT_STATE.INITIALIZING:
            badgeColor = 'cyan';
            break;
        case COMPONENT_STATE.ERROR:
        case COMPONENT_STATE.NOT_READY:
            badgeColor = 'red';
            break;
        case COMPONENT_STATE.IDLE:
            badgeColor = 'orange';
            break;
        case COMPONENT_STATE.MUTED:
            badgeColor = 'yellow';  
            break;
    }

    let sep: React.JSX.Element | undefined;
    if(suffix !== undefined) {
        if(separator === true) {
            sep = <Separator orientation="vertical" borderColor="var(--chakra-colors-color-palette-muted)" ml="2" height="5"/>;
        } else if(separator !== false) {
            sep = separator;
        }
    }

    return <Badge variant="surface" colorPalette={badgeColor} {...rest}><HStack gap="0">{componentStateToFriendly(componentState)}{sep}{suffix}</HStack></Badge>
}