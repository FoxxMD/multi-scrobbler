import { Badge } from "@chakra-ui/react";
import { ComponentProps } from "react";
import { COMPONENT_STATE, ComponentCommonApiJson, componentStateToFriendly, PlayApiCommon } from "../../core/Api";
import { capitalize } from "../../core/StringUtils";

export const PlayStateBadge = (props: ComponentProps<typeof Badge> & { data: PlayApiCommon }) => {

  const { data, ...rest } = props;

  let badgeColor = undefined,
    badgeText = capitalize(data.state);

  switch (data.state) {
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

  return <Badge variant="surface" colorPalette={badgeColor} {...rest}>{badgeText}</Badge>
}

export const ComponentStateBadge = (props: ComponentProps<typeof Badge> & { data: Pick<ComponentCommonApiJson, 'state'> }) => {

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