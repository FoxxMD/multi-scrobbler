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
    LuLockOpen,
    LuCopyPlus,
    LuClipboardPaste,
    LuClipboardCopy,
    LuTimerReset,
    LuPencil,
    LuBraces,
    LuText,
    LuCode,
    LuPlus,
    LuSearch,
    LuTextCursor,
    LuCaseUpper,
    LuLogIn,
    LuLogOut,
} from "react-icons/lu"
import { VscDebugRestart, VscDebugStepOver } from 'react-icons/vsc';
import { HiMiniStop } from "react-icons/hi2";
import { FaTrashCan, FaFlagCheckered } from "react-icons/fa6";
import { MdOutlineFiberNew } from "react-icons/md";
import { RiZzzFill } from "react-icons/ri";
import { SiGoogledocs } from "react-icons/si";
import type { Clipboard, IconProps} from "@chakra-ui/react";
import { IconButton, useClipboard, Spinner, Icon, StackSeparator, HStack, Badge } from "@chakra-ui/react"
import type {ComponentProps, PropsWithChildren, ReactNode} from 'react';
import type {IconBaseProps, IconType} from "react-icons/lib";

// below are from https://selfh.st/icons/
import LZ from "./custom/listenbrainz.svg?react";
import Musicbrainz from "./custom/musicbrainz.svg?react";
import Rocksky from "./custom/rocksky.svg?react";
import AppleMusic from "./custom/apple-music.svg?react";
import Azuracast from "./custom/azuracast.svg?react";
import Deezer from "./custom/deezer.svg?react";
import Discord from "./custom/discord.svg?react";
import GoogleCast from "./custom/google-chrome.svg?react";
import Kodi from "./custom/kodi.svg?react";
import Koito from "./custom/koito.svg?react";
import Lastfm from "./custom/last-fm.svg?react";
import Maloja from "./custom/maloja.svg?react";
import YandexMusic from "./custom/yandex.svg?react";
import Subsonic from "./custom/subsonic.svg?react";
import Icecast from "./custom/icecast.svg?react";
import Webscrobbler from "./custom/webscrobbler.svg?react";
import Jellyfin from "./custom/jellyfin.svg?react";
import Spotify from "./custom/spotify.svg?react";
import Youtube from "./custom/youtube.svg?react";
import Plex from "./custom/plex.svg?react";

 import { FaMixcloud } from "react-icons/fa";
 import { FcVlc } from "react-icons/fc";

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
export const EllipsisChakraIcon = makeChakraIcon(LuEllipsis);
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
/** Retry while bypassing normal processing (EX ignore Stage actions) */
export const RetryForceIcon = VscDebugStepOver;
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

export const CopyIconRaw = LuCopy;
export const CopyIcon = makeChakraIcon(LuCopy);
export const CopyIconButton = makeIconButton(LuCopy);

export const CopyToRight = LuClipboardPaste;
export const CopyToRightIcon = makeChakraIcon(LuClipboardPaste);
export const CopyToRightButton = makeIconButton(LuClipboardPaste);

export const CopyToLeft = LuClipboardCopy;
export const CopyToLeftIcon = makeChakraIcon(LuClipboardCopy);
export const CopyToLeftButton = makeIconButton(LuClipboardCopy);

export const ExclamationCircleIcon = makeChakraIcon(LuCircleAlert);

export const ExclamationTriangleIcon = makeChakraIcon(LuTriangleAlert);

export const TimelineIndicatorIconQueued = makeChakraIcon(LuClock);

export const SparkleIcon = makeChakraIcon(LuSparkles);

export const UnlockIconRaw = LuLockOpen;
export const UnlockIcon = makeChakraIcon(LuLockOpen);
export const UnlockButton = makeIconButton(LuLockOpen);

export const availableMusicServiceIcons = ['spotify','musicbrainz','youtube','jellyfin','plex','listenbrainz','rocksky'];

export const getMusicServiceIcon = (service?: string): IconType | undefined => {
    const lower = service === undefined ? undefined : service.toLocaleLowerCase();
    switch(lower) {
        case 'spotify':
            return Spotify as unknown as IconType;
        case 'musicbrainz':
            return Musicbrainz as unknown as IconType;
        case 'youtube':
            return Youtube as unknown as IconType;
        case 'jellyfin':
            return Jellyfin as unknown as IconType;
        case 'plex':
            return Plex as unknown as IconType;
        case 'listenbrainz':
        case 'endpointlz':
            return LZ as unknown as IconType;
        case 'rocksky':
            return Rocksky as unknown as IconType;
        case 'applemusic':
            return AppleMusic as unknown as IconType;
        case 'azuracast':
            return Azuracast as unknown as IconType;
        case 'deezer':
            return Deezer as unknown as IconType;
        case 'discord':
            return Discord as unknown as IconType;
        case 'chromecast':
            return GoogleCast as unknown as IconType;
        case 'kodi':
            return Kodi as unknown as IconType;
        case 'koito':
            return Koito as unknown as IconType;
        case 'lastfm':
        case 'endpointlfm':
            return Lastfm as unknown as IconType;
        case 'maloja':
            return Maloja as unknown as IconType;
        case 'ymbridge':
            return YandexMusic as unknown as IconType;
        case 'subsonic':
            return Subsonic as unknown as IconType;
        case 'icecast':
            return Icecast as unknown as IconType;
        case 'mixcloud':
            return FaMixcloud;
        case 'vlc':
            return FcVlc;
        case 'webscrobbler':
            return Webscrobbler as unknown as IconType;
        default:
            return undefined;
    }
}

export const getMusicServiceIconOrDefault = (service?: string): IconType => {
    const icon = getMusicServiceIcon(service);
    if(icon === undefined) {
        return LuExternalLink;
    }
    return icon;
}

export const hasMusicServiceIcon = (service?: string): boolean => service === undefined ? false : availableMusicServiceIcons.includes(service.toLocaleLowerCase());

export const getMusicServiceIconElement = (service?: string): ReactNode => {
    const ServiceIcon = getMusicServiceIconOrDefault(service);
    return <ServiceIcon/>;
}

export const getMusicServiceChakraIcon = (service: string) => {
    const ServiceIcon = getMusicServiceIconOrDefault(service);
    return (props: IconProps = {}) => {
        if (service === 'isrc') {
            return <Badge marginX="0" colorPalette="purple"
                // @ts-expect-error its fine
                size={props.size ?? 'xs'} variant="subtle">ISRC</Badge>;
        }
        return <Icon {...props}><ServiceIcon /></Icon>
    };
}

export const MusicServiceIcons = (props: {
    services?: string[],
    iconProps?: IconProps,
    seperator?: boolean
} & Omit<ComponentProps<typeof HStack>, 'children'>) => {
    const {
        services = [],
        seperator = false,
        iconProps = {},
        ...rest
    } = props;
    if (services.length === 0) {
        return undefined;
    }
    return (
        <HStack {...rest} separator={seperator === true ? <StackSeparator /> : undefined}>
            {services.map((x, i) => <Icon key={i} {...iconProps}>{getMusicServiceIconElement(x)}</Icon>)}
        </HStack>
    )
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

export const SyncPlayIconRaw = LuCopyPlus;
export const SyncPlayIcon = makeChakraIcon(LuCopyPlus);
export const SyncPlayButton = makeIconButton(LuCopyPlus);

export const ResetIconRaw = LuTimerReset;
export const ResetIcon = makeChakraIcon(LuTimerReset);
export const ResetButton = makeIconButton(LuTimerReset);

export const EditIconRaw = LuPencil;
export const EditIcon = makeChakraIcon(LuPencil);
export const EditButton = makeChakraIconButton(LuPencil);

export const BracesIconRaw = LuBraces;
export const BracesIcon = makeChakraIcon(LuBraces);
export const BracesButton = makeIconButton(LuBraces);

export const TextIconRaw = LuText;
export const TextIcon = makeChakraIcon(LuText);
export const TextButton = makeIconButton(LuText);

export const CodeIconRaw = LuCode;
export const CodeIcon = makeChakraIcon(LuCode);
export const CodeButton = makeIconButton(LuCode);

export const PlusIconRaw = LuPlus;
export const PlusIcon = makeChakraIcon(LuPlus);
export const PlusButton = makeIconButton(LuPlus);

export const SearchIconRaw = LuSearch;
export const SearchIcon = makeChakraIcon(LuSearch);
export const SearchButton = makeIconButton(LuSearch);

export const CursorIconRaw = LuTextCursor;
export const CursorIcon = makeChakraIcon(LuTextCursor);
export const CursorButton = makeIconButton(LuTextCursor);

export const LettersIconRaw = LuCaseUpper;
export const LettersIcon = makeChakraIcon(LuCaseUpper);
export const LettersButton = makeIconButton(LuCaseUpper);

export const LoginIconRaw = LuLogIn;
export const LoginIcon = makeChakraIcon(LuLogIn);
export const LoginButton = makeIconButton(LuLogIn);

export const LogoutIconRaw = LuLogOut;
export const LogoutIcon = makeChakraIcon(LuLogOut);
export const LogoutButton = makeIconButton(LuLogOut);