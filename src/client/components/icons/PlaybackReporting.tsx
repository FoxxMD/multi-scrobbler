import { IconButton,  Text, Link } from "@chakra-ui/react"
import { ExclamationCircleIcon, SparkleIcon } from "./ChakraIcons"
import type React from "react"
import { ToggleTip } from "../ToggleTip"
import { LuSparkles } from "react-icons/lu"

const playbackReportLink = <Link variant="underline" href="https://docs.multi-scrobbler.app/configuration/sources/subsonic/#enhanced-playback-reporting" target="_blank">Enhanced Playback Reporting</Link>

export interface PlayBackReportingServerProps {
    playbackReporting: boolean
}
export const PlaybackReportingServer = (props: PlayBackReportingServerProps) => (
        <ToggleTip
            positioning={{ placement: "bottom-start" }}
            content={<Text my="4">
                            This Subsonic <strong>server</strong> {props.playbackReporting ? 'supports' : 'does not support'} {playbackReportLink}.
                    </Text>}>
            <IconButton
                height="var(--chakra-sizes-4)"
                variant="ghost"
                color="blue.focusRing"
                aria-label="info"
                size="xs"
            >{props.playbackReporting ? <SparkleIcon /> : <ExclamationCircleIcon />}</IconButton></ToggleTip>
    );

export interface PlayBackReportingPlayerProps {
    playbackReporting: boolean
    hasFields: boolean
}
export const PlaybackReportingPlayer = (props: PlayBackReportingPlayerProps) => {
    if (!props.playbackReporting) {
        return null;
    }
    let content: React.JSX.Element;
    if (props.playbackReporting && props.hasFields) {
        content = (
            <Text my="4">
                This Subsonic <strong>client</strong> is sending {playbackReportLink} fields.
            </Text>
        );
    } else {
        content = (
            <Text my="4">
                This Subsonic <strong>client</strong> is <strong>not</strong> sending {playbackReportLink} fields.
            </Text>
        );
    }

    return (
        <ToggleTip
            positioning={{ placement: "bottom-start" }}
            content={content}>
            <IconButton
                height="var(--chakra-sizes-4)"
                variant="ghost"
                color="blue.focusRing"
                aria-label="info"
                size="2xs"
            >{props.playbackReporting && props.hasFields ? <LuSparkles /> : <ExclamationCircleIcon />}</IconButton></ToggleTip>
    )
}