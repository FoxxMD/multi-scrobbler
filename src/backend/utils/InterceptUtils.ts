import { BatchInterceptor, HttpRequestEventMap } from '@mswjs/interceptors'
import { ClientRequestInterceptor } from '@mswjs/interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { nanoid } from 'nanoid';

interface Intercept {
    req?: Request, 
    id: string, 
    res?: Response, 
}

const interceptor = new BatchInterceptor({
  name: 'global-interceptor',
  interceptors: [
    new ClientRequestInterceptor(),
    new XMLHttpRequestInterceptor(),
  ],
});

interceptor.apply();

const scopedIntercepts = new Map<string, Intercept>();

const getScopedIntercept = (id: string): Intercept => scopedIntercepts.get(id) ?? {id};

export const interceptRequest = (listenerId?: string): string => {
    const lid = listenerId || nanoid();

    const data = getScopedIntercept(lid);

    scopedIntercepts.set(lid, {...data, id: lid});
    let reqId: string | undefined;

    const reqLis = (args: HttpRequestEventMap['request'][0]) => {
        reqId = args.requestId;
        scopedIntercepts.set(lid, {...getScopedIntercept(lid), req: args.request});
        interceptor.off('request', reqLis);
    }
    interceptor.on('request', reqLis);

    const resLis = (args: HttpRequestEventMap['response'][0]) => {
        if(args.requestId === reqId) {
            scopedIntercepts.set(lid, {...getScopedIntercept(lid), res: args.response});
            interceptor.off('response', resLis);
        }
    }
    interceptor.on('response', resLis);
    return lid;
}

export const getIntercept = (id: string): Intercept | undefined => {
    const d = scopedIntercepts.get(id);
    if(d !== undefined && d.res !== undefined) {
        scopedIntercepts.delete(id);
    }
    return d;
}

