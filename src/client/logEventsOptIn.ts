import type { useSSEContext } from "@flamefrontend/sse-runtime-react";
import ky from 'ky';
import { useEffect } from 'react';
import type { MsSseEvent } from '../core/Api';
import { sseTabId } from './sseTab';

/*
* The server only pushes log events to an /api/events connection after it is opted in via PUT /api/events/:tab/logs
*
* With SSE coordination only the leader tab owns the connection (opened with the leader's tab id)
* so every tab broadcasts whether it is rendering logs and the leader opts its connection in if any tab is.
* When coordination is unavailable (insecure context, no Web Locks) role is null and each tab manages its own connection.
* */

type SSEClient = ReturnType<typeof useSSEContext<MsSseEvent>>;
type ViewerMessage = {type: 'viewing', tab: string, viewing: boolean} | {type: 'query'};

let client: SSEClient | undefined;
// number of mounted, streaming LogsFetchable in this tab
let localViewers = 0;
// NOTE: a follower tab that dies without pagehide stays here until the next leader change
// this is unfortunate but its not showstopping since the failure mode of
// "just continue to stream logs" is actually an OK state
const viewingTabs = new Set<string>();
// last opt-in sent for the current connection, undefined = server state unknown
let sent: boolean | undefined;

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ms-log-viewers') : undefined;

// chained so enable/disable can't arrive out of order
let putQueue: Promise<unknown> = Promise.resolve();
const putLogEvents = (enabled: boolean) => {
    putQueue = putQueue.then(() => ky.put(`api/events/${sseTabId}/logs`, {json: {enabled}})).catch(() => undefined);
};

const sync = () => {
    // server forgets opt-in when a connection closes
    if(client?.getStatus() !== 'open') {
        sent = undefined;
        return;
    }
    const role = client.getRole?.() ?? null;
    if(role === 'follower') {
        sent = undefined;
        return;
    }
    const want = role === 'leader' ? viewingTabs.size > 0 : localViewers > 0;
    if(want !== sent) {
        sent = want;
        putLogEvents(want);
    }
}

const post = (msg: ViewerMessage) => channel?.postMessage(msg);

const setLocalViewing = (viewing: boolean) => {
    if(viewing) {
        viewingTabs.add(sseTabId);
    } else {
        viewingTabs.delete(sseTabId);
    }
    post({type: 'viewing', tab: sseTabId, viewing});
    sync();
}

if(channel !== undefined) {
    channel.onmessage = ({data}: MessageEvent<ViewerMessage>) => {
        if(data.type === 'viewing') {
            if(data.viewing) {
                viewingTabs.add(data.tab);
            } else {
                viewingTabs.delete(data.tab);
            }
            sync();
        } else if(data.type === 'query' && localViewers > 0) {
            post({type: 'viewing', tab: sseTabId, viewing: true});
        }
    };
    window.addEventListener('pagehide', () => {
        if(localViewers > 0) {
            post({type: 'viewing', tab: sseTabId, viewing: false});
        }
    });
}

const wire = (sse: SSEClient) => {
    client = sse;
    sse.subscribeStatus(sync);
    sse.subscribeRole?.((role) => {
        sent = undefined;
        if(role === 'leader') {
            // rebuild from live tabs, previous leader's knowledge may be stale
            viewingTabs.clear();
            if(localViewers > 0) {
                viewingTabs.add(sseTabId);
            }
            post({type: 'query'});
        }
        sync();
    });
}

export const useLogEventsOptIn = (sse: SSEClient, streamable: boolean) => {
    useEffect(() => {
        if(client !== sse) {
            wire(sse);
        }
    }, [sse]);

    useEffect(() => {
        if(!streamable) {
            return;
        }
        localViewers++;
        if(localViewers === 1) {
            setLocalViewing(true);
        }
        return () => {
            localViewers--;
            if(localViewers === 0) {
                setLocalViewing(false);
            }
        };
    }, [streamable]);
}
