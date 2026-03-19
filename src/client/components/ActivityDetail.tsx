import { ComponentProps } from "react"
import { Accordion, For, Span, Stack, Text, Box, AbsoluteCenter, Button, Separator, HStack, Flex, Badge, IconButton, Container, Icon } from '@chakra-ui/react';
import { ErrorLike, PlayActivity } from "../../core/Atomic";
import { PlayData } from "./PlayData";
import { ErrorAlert } from "./ErrorAlert";
import { AiOutlineExclamationCircle } from "react-icons/ai";

export interface ActivityDetailProps {
    activity: PlayActivity
}

export const ActivityDetails = (props: ActivityDetailProps) => {
    const {
        activity,
        activity: {
            error
        }
    } = props;
    return (
        <Accordion.Root variant="enclosed" collapsible multiple>
            <Accordion.Item value="info">
                <Accordion.ItemTrigger>
                    <Accordion.ItemIndicator />
                    Play Data
                </Accordion.ItemTrigger>
                <Accordion.ItemContent>
                    <Accordion.ItemBody>
                        <PlayData play={activity.play} final={activity.play} />
                    </Accordion.ItemBody>
                </Accordion.ItemContent>
            </Accordion.Item>
            <Accordion.Item value="timeline">
                <Accordion.ItemTrigger>
                    <Accordion.ItemIndicator />
                    Timeline {error !== undefined ? (<Icon size="sm" color="red.focusRing">
                        <AiOutlineExclamationCircle />
                    </Icon>) : null}
                </Accordion.ItemTrigger>
                <Accordion.ItemContent>
                    <Accordion.ItemBody>
                        {error !== undefined ? <ErrorAlert error={error} /> : null}
                    </Accordion.ItemBody>
                </Accordion.ItemContent>
            </Accordion.Item>
        </Accordion.Root>
    )
}