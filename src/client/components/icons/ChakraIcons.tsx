import {
    LuChevronRight,
    LuChevronLeft,
    LuCircleAlert,
    LuTriangleAlert,
    LuActivity,
    LuGithub,
    LuTerminal,
    LuAlignJustify,
    LuX,
    LuCheck,
    LuExternalLink,
    LuArrowUp,
    LuCircleArrowUp,
    LuArrowDown,
    LuEllipsis,
    LuEllipsisVertical,
    LuArrowBigRight,
    LuBug,
    LuPower,
    LuPowerOff,
    LuEye,
    LuEyeClosed,
    LuCalendar,
    LuRefreshCw,
    LuCopy,
    LuClock,
    LuSparkles,
    LuLockOpen
} from "react-icons/lu"
import { VscDebugRestart } from 'react-icons/vsc';
import { HiMiniStop } from "react-icons/hi2";
import { FaTrashCan, FaFlagCheckered } from "react-icons/fa6";
import { MdOutlineFiberNew } from "react-icons/md";
import { RiZzzFill } from "react-icons/ri";
import { SiGoogledocs } from "react-icons/si";
import type { Clipboard, IconProps} from "@chakra-ui/react";
import { IconButton, useClipboard, Spinner, Icon } from "@chakra-ui/react"
import type {ComponentProps, PropsWithChildren, ReactNode} from 'react';
import type {IconBaseProps, IconType} from "react-icons/lib";

// below are from https://selfh.st/icons/
import LZ from "./custom/listenbrainz.svg?react";
import Musicbrainz from "./custom/musicbrainz.svg?react";

import { 
    SiSpotify,
    SiYoutube,
    SiJellyfin,
    SiPlex
 } from "react-icons/si";

export const makeIconButton = (Icon: IconType) => (props: PropsWithChildren<ComponentProps<typeof IconButton>> & { iconProps?: IconBaseProps, loading?: boolean }) => {
    const { 
        iconProps = {},
        children,
        loading = false,
        size = 'xs',
        ...rest 
    } = props;
    return (
        <IconButton variant="surface" disabled={loading} size={size} {...rest}>
            {loading ? <Spinner/>  : <Icon {...iconProps} />}{children}
        </IconButton>
    );
}
export const makeChakraIconButton = (IconBase: IconType) => (props: PropsWithChildren<ComponentProps<typeof IconButton>> & { iconProps?: ComponentProps<typeof Icon>, loading?: boolean }) => {
    const { 
        iconProps = {},
        children,
        loading = false,
        size = 'xs',
        ...rest 
    } = props;
    return (
        <IconButton variant="surface" disabled={loading} size={size} {...rest}>
            {loading ? <Spinner/>  : <Icon {...iconProps}><IconBase/></Icon>}{children}
        </IconButton>
    );
}
export const makeChakraIcon = (IconComponent: IconType) => (props: ComponentProps<typeof Icon> & { iconProps?: IconBaseProps }) => {
    const {
        iconProps,
        ...rest
    } = props;
    return <Icon {...rest}><IconComponent {...iconProps}/></Icon>
}

export const ChevronRight = LuChevronRight;
export const ChevronRightButton = (props: ComponentProps<typeof IconButton>) => (
    <IconButton variant="surface" size="xs" {...props}>
        <ChevronRight />
    </IconButton>
);

export const ChevronLeft = LuChevronLeft;
export const ChevronLeftButton = makeIconButton(ChevronLeft);  

export const HeartbeatIcon = LuActivity;
export const HeartbeatButton = (props: ComponentProps<typeof IconButton>) => (
    <IconButton variant="surface" size="xs" {...props}>
        <HeartbeatIcon />
    </IconButton>
);

export const GithubIcon = LuGithub;
export const GithubButton = (props: ComponentProps<typeof IconButton>) => (
    <IconButton variant="surface" size="xs" {...props}>
        <GithubIcon />
    </IconButton>
);

export const DocsIcon = SiGoogledocs;
export const DocsButton = (props: ComponentProps<typeof IconButton>) => (
    <IconButton variant="surface" size="xs" {...props}>
        <DocsIcon />
    </IconButton>
);

export const TerminalIcon = LuTerminal;
export const TerminalButton = (props: ComponentProps<typeof IconButton>) => (
    <IconButton variant="surface" size="xs" {...props}>
        <TerminalIcon />
    </IconButton>
);

export const MenuIcon = LuAlignJustify;
export const MenuButton = makeChakraIconButton(MenuIcon);

export const XIcon = LuX;
export const XButton = makeIconButton(XIcon);

export const CheckIcon = makeChakraIcon(LuCheck);
export const CheckButton = makeIconButton(LuCheck);

export const ExternalLinkIconRaw = LuExternalLink;
export const ExternalLinkIcon = makeChakraIcon(LuExternalLink);
export const ExternalLinkButton = makeIconButton(ExternalLinkIconRaw);

export const UpArrowIcon = LuArrowUp;
export const DownArrowIcon = LuArrowDown;

export const IdleIcon = (props: {animated?: boolean} & ComponentProps<typeof RiZzzFill>) => {
    const {
        animated,
        ...rest
    } = props;
    if(animated) {
        return <RiZzzFill {...rest} style={{animation: 'dashed-player 3s infinite linear'}} />
    }
    return <RiZzzFill {...rest}/>;
};

export const EllipsisIcon = LuEllipsis;
export const EllipsisButton = makeIconButton(EllipsisIcon);
export const EllipsisVerticalIcon = LuEllipsisVertical;
export const EllipsisVerticalButton = makeIconButton(EllipsisVerticalIcon);

export const FatArrowRight = LuArrowBigRight;

export const DebugIcon = LuBug;
export const DebugButton = makeIconButton(DebugIcon);

export const DebugCopy = (props: {value: Clipboard.RootProps['value']} & ComponentProps<typeof IconButton>) => {
    const {
        value,
        onClick,
        children,
        ...rest
    } = props;
    const clipboard = useClipboard({value: value});

    return (
    <IconButton variant="surface" size="xs" onClick={clipboard.copy} {...rest}>
        {clipboard.copied ? <LuCheck/> : <DebugIcon/>}{children}
    </IconButton>
    )
}

export const RetryIcon = VscDebugRestart;
export const RetryButton = makeIconButton(RetryIcon);

export const PowerIcon = LuPower;
export const PowerButton = makeIconButton(PowerIcon);

export const PowerOffIcon = LuPowerOff;
export const PowerOffButton = makeIconButton(PowerOffIcon);

export const EyeIcon = LuEye;
export const EyeButton = makeIconButton(EyeIcon);

export const EyeClosedIcon = LuEyeClosed;
export const EyeClosedButton = makeIconButton(LuEyeClosed);

export const CalendarIcon = LuCalendar;
export const CalendarButton = makeIconButton(CalendarIcon);

export const RefreshIcon = LuRefreshCw;
export const RefreshButton = makeIconButton(RefreshIcon);

export const InsertedIcon = makeChakraIcon(MdOutlineFiberNew);

export const UpdatedIcon = makeChakraIcon(LuCircleArrowUp);

export const CopyIcon = makeChakraIcon(LuCopy);
export const CopyIconButton = makeIconButton(LuCopy);

export const ExclamationCircleIcon = makeChakraIcon(LuCircleAlert);

export const ExclamationTriangleIcon = makeChakraIcon(LuTriangleAlert);

export const TimelineIndicatorIconQueued = makeChakraIcon(LuClock);s

export const SparkleIcon = makeChakraIcon(LuSparkles);

export const UnlockIconRaw = LuLockOpen;
export const UnlockIcon = makeChakraIcon(LuLockOpen);
export const UnlockButton = makeIconButton(LuLockOpen);

export const getMusicServiceIcon = (service: string): IconType => {
    const lower = service === undefined ? undefined : service.toLocaleLowerCase();
    switch(lower) {
        case 'spotify':
            return SiSpotify;
        case 'musicbrainz':
            return Musicbrainz as unknown as IconType;
        case 'youtube':
            return SiYoutube;
        case 'jellyfin':
            return SiJellyfin;
        case 'plex':
            return SiPlex;
        case 'listenbrainz':
            return LZ as unknown as IconType;
        default:
            return LuExternalLink;
    }
}

export const getMusicServiceIconElement = (service: string): ReactNode => {
    const ServiceIcon = getMusicServiceIcon(service);
    return <ServiceIcon/>;
}

export const getMusicServiceChakraIcon = (service: string) => {
    const ServiceIcon = getMusicServiceIcon(service);
    return (props: IconProps = {}) => <Icon {...props}><ServiceIcon/></Icon>;
}

export const StopIconRaw = HiMiniStop;
export const StopIcon = makeChakraIcon(StopIconRaw);
export const StopButton = makeIconButton(StopIconRaw);

export const TrashIconRaw = FaTrashCan;
export const TrashIcon = makeChakraIcon(TrashIconRaw);
export const TrashIconButton = makeIconButton(TrashIconRaw);

export const FinishIconRaw = FaFlagCheckered;
export const FinishIcon = makeChakraIcon(FinishIconRaw);
export const FinishButton = makeIconButton(FinishIconRaw);