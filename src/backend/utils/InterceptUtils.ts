import { BatchInterceptor, HttpRequestEventMap, InterceptorReadyState } from '@mswjs/interceptors'
import { ClientRequestInterceptor } from '@mswjs/interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { nanoid } from 'nanoid';
import { isDebugMode, parseRegexSingleOrFail } from '../utils.js';

interface InterceptFilterOptions {
    url?: string | RegExp
    method?: string
    //body?: string | RegExp
}

type ReqListener = (args: HttpRequestEventMap["request"][0]) => void;
type ResListener = (args: HttpRequestEventMap["response"][0]) => void;

export interface Intercept {
    req?: Request,
    id: string,
    res?: Response,
}

interface InterceptData extends Intercept {
    reqListener?: ReqListener
    resListener?: ResListener
}

const interceptor = new BatchInterceptor({
    name: 'global-interceptor',
    interceptors: [
        new ClientRequestInterceptor(),
        new XMLHttpRequestInterceptor(),
    ],
});

const enableInterceptor = () => {
    if (interceptor.readyState !== InterceptorReadyState.APPLIED && interceptor.readyState !== InterceptorReadyState.APPLYING) {
        interceptor.apply();
    }
}

const disableInterceptor = () => {
    if (interceptor.readyState == InterceptorReadyState.APPLIED || interceptor.readyState == InterceptorReadyState.APPLYING) {
        interceptor.dispose();
    }
}

const scopedIntercepts = new Map<string, InterceptData>();

const getScopedIntercept = (id: string): InterceptData => scopedIntercepts.get(id) ?? { id };

type RequestFilterFunc = (req: Request) => boolean;

const generateRequestFilter = (opts?: InterceptFilterOptions): RequestFilterFunc => {
    if(opts === undefined) {
        return (req: Request) => true;
    }
    const filters: RequestFilterFunc[] = [];
    if(opts.method !== undefined) {
        filters.push((req: Request) => req.method.toLocaleLowerCase() === opts.method.toLocaleLowerCase());
    }
    if(opts.url !== undefined) {
        if(typeof opts.url === 'string') {
            filters.push((req: Request) => req.url.toString().includes(opts.url as string));
        } else {
            filters.push((req: Request) => parseRegexSingleOrFail(opts.url as RegExp, req.url.toString()) !== undefined);
        }
    }
    // if(opts.body !== undefined) {
    //     const bodyFunc = typeof opts.body === 'string' ? (str: string) => str.includes(opts.body as string) : (str: string) => parseRegexSingleOrFail(opts.body as RegExp, str) !== undefined;
    //     filters.push((req: Request) => {
    //         const body = req.clone().text(); // async :/
    //     })
    // }

    return (req: Request) => {
        for(const f of filters) {
            if(f(req) === false) {
                return false;
            }
        }
        return true;
    }
}

export const interceptRequest = (listenerId?: string, opts?: InterceptFilterOptions): string => {
    const lid = listenerId || nanoid();

    if(!isDebugMode()) {
        return lid;
    }

    enableInterceptor();

    const data = getScopedIntercept(lid);

    scopedIntercepts.set(lid, { ...data, id: lid });
    let reqId: string | undefined;

    const filterFunc = generateRequestFilter(opts);

    const reqLis: ReqListener = (args) => {
        if(filterFunc(args.request)) {
            reqId = args.requestId;
            interceptor.off('request', reqLis);
            scopedIntercepts.set(lid, { ...getScopedIntercept(lid), req: args.request, reqListener: undefined });
        }
    }
    scopedIntercepts.set(lid, { ...getScopedIntercept(lid), reqListener: reqLis });
    interceptor.on('request', reqLis);

    const resLis: ResListener = (args) => {
        if (args.requestId === reqId) {
            interceptor.off('response', resLis);
            scopedIntercepts.set(lid, { ...getScopedIntercept(lid), res: args.response, resListener: undefined });
        }
    }
    scopedIntercepts.set(lid, { ...getScopedIntercept(lid), resListener: resLis });
    interceptor.on('response', resLis);
    return lid;
}

export const getIntercept = (id: string, deleteOn: 'any' | 'request' | 'response' = 'response'): Intercept | undefined => {
    const d = scopedIntercepts.get(id);
    if (d !== undefined) {
        if(deleteOn === 'any') {
            deleteIntercept(id);
        } else if(deleteOn === 'request' && d.req !== undefined) {
            deleteIntercept(id);
        } else if(deleteOn === 'response' && d.res !== undefined) {
            deleteIntercept(id);
        }
    }
    return d;
}

export const deleteIntercept = (id: string): void => {
    const d = scopedIntercepts.get(id);
    if(d !== undefined) {
        if(d.reqListener !== undefined) {
            interceptor.off('request', d.reqListener);
        }
        if(d.resListener !== undefined) {
            interceptor.off('response', d.resListener);
        }
        scopedIntercepts.delete(id);
    }
}

