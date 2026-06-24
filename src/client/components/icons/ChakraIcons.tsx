import { LuChevronRight, LuChevronLeft, LuActivity, LuGithub, LuTerminal, LuAlignJustify, LuX, LuExternalLink, LuArrowUp, LuArrowDown, LuEllipsis, LuArrowBigRight } from "react-icons/lu"
import { RiZzzFill } from "react-icons/ri";
import { SiGoogledocs } from "react-icons/si";
import { IconButton } from "@chakra-ui/react"
import { ComponentProps } from 'react';
import { IconType } from "react-icons/lib";

export const makeIconButton = (Icon: IconType) => (props: ComponentProps<typeof IconButton>) => (
    <IconButton variant="surface" size="xs" {...props}>
        <Icon />
    </IconButton>
);

export const ChevronRight = LuChevronRight;
export const ChevronRightButton = (props: ComponentProps<typeof IconButton>) => (
    <IconButton variant="surface" size="xs" {...props}>
        <ChevronRight />
    </IconButton>
);

export const ChevronLeft = LuChevronLeft;
export const ChevronLeftButton = (props: ComponentProps<typeof IconButton>) => (
    <IconButton variant="surface" size="xs" {...props}>
        <ChevronLeft />
    </IconButton>
);

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

export const FatArrowRight = LuArrowBigRight;