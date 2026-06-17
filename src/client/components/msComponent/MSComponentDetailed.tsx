import React, { ComponentProps, useMemo, forwardRef, Fragment, useEffect, useState, useCallback } from "react"
import { DataList, Badge, Box, Heading, Skeleton, Stat, Separator, HStack, Flex, Collapsible, Card, LinkOverlay, LinkBox, SkeletonText } from '@chakra-ui/react';
import { COMPONENT_STATE, ComponentClientApiJson, ComponentCommonApiJson, ComponentSourceApiJson, componentStateToFriendly, isComponentClientApiJson, isComponentSourceApiJson, MsSseEvent, MsSseEventPayload } from "../../../core/Api.js";
import { TextMuted } from "../TextMuted.js";
import { isClientType } from "../../../backend/common/infrastructure/Atomic.js";
import { capitalize } from "../../../core/StringUtils.js";
import { ShortDateDisplay } from "../DateDisplay.js";
import { ChevronRightButton } from "../icons/ChakraIcons.js";
import { ChakraPlayer, ChakraPlayerFetchable } from "../chakraPlayer/Player.js";
import { InfoTip } from "../ToggleTip.js";
import { QueryFunctionContext, queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorAlert } from "../ErrorAlert";
import ky from 'ky';
import { baseUrl } from "../../utils";
import { useTimeout } from 'react-use-timeout';
import {
    useSSEContext,
    useSSEEvent,
    useSSEAnyEvent
} from "@flamefrontend/sse-runtime-react";
import { SourcePlayerJson } from "../../../core/Atomic.js";

export const MSComponentHeading = (props: { data?: Pick<ComponentCommonApiJson, 'name' | 'mode' | 'type'>, fetchable?: boolean }) => {
    if (props.data === undefined) {
        return (
            <Box>
                <Skeleton width="5rem" height="5rem" />
                <Skeleton width="3rem" height="1rem" />
            </Box>
        )
    }
    return (
        <Box>
            <Heading size="2xl">{props.data.name}</Heading>
            <Heading color="fg.subtle" size="lg">({props.data.mode}) {capitalize(props.data.type)}</Heading>
        </Box>
    )
}

export const MSComponentStats = (props: { data?: ComponentCommonApiJson }) => {
    if (props.data === undefined) {
        return (
            <Box>
                <SkeletonText noOfLines={6} />
            </Box>
        )
    }
    return (
        <Box>
            <Heading size="2xl">{props.data.name}</Heading>
            <Heading color="fg.subtle" size="lg">({props.data.mode}) {capitalize(props.data.type)}</Heading>
        </Box>
    )
}