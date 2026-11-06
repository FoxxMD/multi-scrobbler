/**
 * Embeddable public dashboard, served as /embed (embed.html) for iframes on other sites.
 *
 * Its own entry on purpose: it is the only document that may be framed (see embedFramingMiddleware) so it must never
 * be able to render the logged in dashboard. No router, no auth client, no cookies and nothing stored.
 *
 * Query params:
 *
 * * type -- recent (default, Now Playing then Recent) | now (only Now Playing) | stats (counts and components)
 * * n -- show at most this many recent plays
 * * theme -- light | dark, default follows the visitor's system
 * * transparent -- 1 for no background
 * * cta -- 0 to hide the multi-scrobbler logo and link at the bottom
 *
 * Posts {type: 'multi-scrobbler-embed', height} to the parent whenever its height changes so the host page can resize the iframe.
 * */
import React, { useLayoutEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import { Box, Flex, Spinner, Stack, Text } from '@chakra-ui/react';
import { Provider } from './components/Provider';
import { CallToAction, ComponentStats, CountStats, isPublicDashboardEnabled, RecentPublicPlaysList, usePublicDashboard } from './components/PublicDashboard';

dayjs.extend(utc);
dayjs.extend(relativeTime);

const params = new URLSearchParams(window.location.search);
const typeParam = params.get('type');
const type = typeParam === 'now' || typeParam === 'stats' ? typeParam : 'recent';
const themeParam = params.get('theme');
const theme = themeParam === 'light' || themeParam === 'dark' ? themeParam : undefined;
const transparent = params.get('transparent') === '1';
const limitParam = Number.parseInt(params.get('n') ?? '', 10);
const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : undefined;
const cta = params.get('cta') !== '0';

const Message = (props: {children: string}) => <Flex justify="center" py="4"><Text color="fg.muted">{props.children}</Text></Flex>;

const EmbedContent = () => {
    const {isPending, isError, data} = usePublicDashboard();
    if (isPending) {
        return <Flex justify="center" py="4"><Spinner/></Flex>;
    }
    if (isError || !isPublicDashboardEnabled(data.data)) {
        return <Message>Not available</Message>;
    }
    const {recent, nowPlaying} = data.data;
    switch (type) {
        case 'now':
            if (nowPlaying === undefined) {
                return <Message>Not available</Message>;
            }
            return nowPlaying === null ? <Message>Not playing anything right now</Message> : <RecentPublicPlaysList nowPlaying={nowPlaying}/>;
        case 'stats':
            return <Stack gap="6"><CountStats {...data.data}/><ComponentStats {...data.data}/></Stack>;
        default:
            if (recent === undefined && nowPlaying === undefined) {
                return <Message>Not available</Message>;
            }
            return <RecentPublicPlaysList data={limit !== undefined ? recent?.slice(0, limit) : recent} nowPlaying={nowPlaying}/>;
    }
}

const Embed = () => {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const elm = ref.current;
        if (elm === null || window.parent === window) {
            return;
        }
        // only a number is sent, so any parent origin is fine
        const observer = new ResizeObserver(() => window.parent.postMessage({type: 'multi-scrobbler-embed', height: Math.ceil(elm.getBoundingClientRect().height)}, '*'));
        observer.observe(elm);
        return () => observer.disconnect();
    }, []);
    return (
        <Box ref={ref} p="2">
            {transparent ? <style>{'html, body { background: transparent !important; }'}</style> : undefined}
            <EmbedContent/>
            {/* a bit smaller than the embed's text */}
            {cta ? <Box mt="3"><CallToAction textStyle="sm" logo/></Box> : undefined}
        </Box>
    );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        {/* own storage key so the dashboard's theme override is never used here */}
        <Provider forcedTheme={theme} storageKey="ms-embed-theme">
            <Embed/>
        </Provider>
    </React.StrictMode>
);
