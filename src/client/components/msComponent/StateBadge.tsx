import React, { ComponentProps } from "react"
import { Badge } from '@chakra-ui/react';
import { COMPONENT_STATE, ComponentCommonApiJson, componentStateToFriendly } from "../../../core/Api.js";

export const StateBadge = (props: ComponentProps<typeof Badge> & { data: Pick<ComponentCommonApiJson, 'state'> }) => {

    const { data, ...rest } = props;

    let badgeColor = undefined;

    switch (data.state) {
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

    return <Badge variant="surface" colorPalette={badgeColor} {...rest}>{componentStateToFriendly(data.state)}</Badge>
}