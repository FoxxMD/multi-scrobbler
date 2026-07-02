import {
    LuChevronRight,
    LuChevronLeft,
    LuActivity,
    LuGithub,
    LuTerminal,
    LuAlignJustify,
    LuX,
    LuCheck,
    LuExternalLink,
    LuArrowUp,
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
    LuRefreshCw
} from "react-icons/lu"
import { VscDebugRestart } from 'react-icons/vsc';
import { RiZzzFill } from "react-icons/ri";
import { SiGoogledocs } from "react-icons/si";
import { IconButton, Clipboard, useClipboard, Spinner } from "@chakra-ui/react"
import { ComponentProps, PropsWithChildren } from 'react';
import { IconBaseProps, IconType } from "react-icons/lib";

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
export const MenuButton = makeIconButton(MenuIcon);

export const XIcon = LuX;
export const XButton = makeIconButton(XIcon);

export const CheckIcon = LuCheck;
export const CheckButton = makeIconButton(CheckIcon);

export const ExternalLinkIcon = LuExternalLink;
export const ExternalLinkButton = makeIconButton(ExternalLinkIcon);

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