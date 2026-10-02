import { AbsoluteCenter, Avatar, HStack, Icon, StackSeparator, Text } from "@chakra-ui/react"
import type { MetadataResultImage, MetadataResultServiceScore } from "../../../core/Api"
import { getMusicServiceIconElement } from "../icons/ChakraIcons"
import type React from "react"

export const LeftSideMetadataResultContent = (props: MetadataResultServiceScore & MetadataResultImage) => {
    if (props.image === undefined) {
        return <MetadataServiceScore {...props} />
    }
    return (
        <ArtworkAvatar
            overlay={<MetadataServiceScore {...props} />}
            {...props} />
    )
}

export const MetadataServiceScore = (props: MetadataResultServiceScore) => (
    <HStack gap="1" separator={<StackSeparator />}>
        <Icon size="sm">{getMusicServiceIconElement(props.service)}</Icon>
        {props.score !== undefined ? <Text color="fg.subtle" textStyle="sm">{props.score}</Text> : undefined}
    </HStack>
)

export const ArtworkAvatar = (props: MetadataResultImage & { overlay?: React.JSX.Element }) => {
    let overlayContent: React.JSX.Element | undefined = undefined;
    if (props.overlay !== undefined) {
        overlayContent = <AbsoluteCenter paddingBottom="40px" axis="horizontal">{props.overlay}</AbsoluteCenter>
    }

    return (
        <Avatar.Root pos="relative" shape="square" size="2xl">
            {overlayContent}
            <Avatar.Fallback name="Art" />
            <Avatar.Image src={props.image} />
        </Avatar.Root>
    )
}