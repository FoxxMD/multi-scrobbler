import { ComponentProps, useState } from "react"
import { Accordion, For, Span, Stack, Text, Box, AbsoluteCenter, Button, Separator, HStack, Flex, Badge, IconButton, Container, Icon } from '@chakra-ui/react';
import { ErrorLike, PlayActivity } from "../../core/Atomic";
import { PlayData } from "./PlayData";
import { ErrorAlert } from "./ErrorAlert";
import { AiOutlineExclamationCircle } from "react-icons/ai";
import { ActivityTimeline } from "./ActivityTimeline";
import { ExpandCollapse } from "./ExpandCollapse";

export interface ActivityDetailProps {
    activity: PlayActivity
}

export const ActivityDetails = (props: ActivityDetailProps) => {
    const {
        activity,
        activity: {
            error,
            play: {
                meta: {
                    lifecycle: {
                        original,
                        scrobble
                    } = {},
                    lifecycle
                } = {},
            } = {}
        }
    } = props;

    const [collapsibleOpen, setCollapsibleOpen] = useState(undefined);

    return (
        <Box>
        <Accordion.Root variant="enclosed" collapsible multiple>
            <Accordion.Item value="info">
                <Accordion.ItemTrigger>
                    <Accordion.ItemIndicator />
                    Play Data
                </Accordion.ItemTrigger>
                <Accordion.ItemContent>
                    <Accordion.ItemBody>
                        <PlayData play={original ?? activity.play} final={activity.play} />
                    </Accordion.ItemBody>
                </Accordion.ItemContent>
            </Accordion.Item>
            <Accordion.Item value="timeline">
                <Flex justify="flex-start">
                    <Accordion.ItemTrigger>
                        <Accordion.ItemIndicator />
                        Timeline {error !== undefined ? (<Icon size="sm" color="red.focusRing">
                            <AiOutlineExclamationCircle />
                        </Icon>) : null}
                    </Accordion.ItemTrigger>
                    <Stack style={{
                        paddingBlock: "var(--accordion-padding-y)",
                        paddingInline: "var(--accordion-padding-x)"
                    }} justify="flex-start" alignItems="flex-end">
                        <ExpandCollapse onClick={(val) => setCollapsibleOpen(val)} />
                    </Stack>
                </Flex>
                <Accordion.ItemContent>
                    <Accordion.ItemBody>
                        <ActivityTimeline play={activity.play} collapsibleOpen={collapsibleOpen} />
                    </Accordion.ItemBody>
                </Accordion.ItemContent>
            </Accordion.Item>
        </Accordion.Root>
        {error !== undefined ? <ErrorAlert error={error} /> : null}
        </Box>
    )
}