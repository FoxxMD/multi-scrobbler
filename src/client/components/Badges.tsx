import { Badge, Separator, HStack } from "@chakra-ui/react";
import React, { ComponentProps, useState, useCallback, useEffect } from "react";
import { COMPONENT_STATE, ComponentCommonApiJson, componentStateToFriendly, MsSseEvent, MsSseEventPayload, PlayApiCommon } from "../../core/Api";
import { capitalize } from "../../core/StringUtils";
import { PlayerState } from "../../backend/common/infrastructure/config/source/mpd";
import {useSSE, useSSEContext, useSSEEvent} from "@flamefrontend/sse-runtime-react";
import { Second } from "../../core/Atomic";
import { useTimeout } from 'react-use-timeout';

export const PlayStateBadge = (props: ComponentProps<typeof Badge> & { state: PlayApiCommon['state'], suffix?: React.JSX.Element }) => {

  const { state, suffix, ...rest } = props;

  let badgeColor = undefined,
    badgeText = capitalize(state);

  switch (state) {
    case 'queued':
      badgeColor = 'gray';
      break;
    case 'scrobbled':
    case 'discovered':
      badgeColor = 'green';
      break;
    case 'failed':
      badgeColor = 'red';
      break;
    case 'discarded':
      badgeColor = 'grey';
      break;
    case 'duped':
      badgeColor = 'orange';
      break;
  }

  return <Badge variant="surface" colorPalette={badgeColor} {...rest}>{badgeText}{suffix}</Badge>
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