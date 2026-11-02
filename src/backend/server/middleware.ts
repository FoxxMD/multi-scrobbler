import type {Logger} from "@foxxmd/logging";
import type ScrobbleClients from "../scrobblers/ScrobbleClients.ts";
import type ScrobbleSources from "../sources/ScrobbleSources.ts";
import type {Request, Response, NextFunction, ErrorRequestHandler, RequestHandler} from "express";
import type AbstractSource from "../sources/AbstractSource.ts";
import type AbstractScrobbleClient from "../scrobblers/AbstractScrobbleClient.ts";
import type { TypedMiddleware } from "@minisylar/express-typed-router";
import { timingSafeEqual } from "node:crypto";

export const nonEmptyBody = (logger: Logger, origin: string = 'Origin'): TypedMiddleware => async (req, res, next) => {
    const bodyEmpty = req.body === undefined || req.body === null || (typeof req.body === 'object' && Object.keys(req.body).length === 0);
    if (bodyEmpty) {
        const lengthHeader = req.header('content-length');
        const length = lengthHeader !== undefined ? Number.parseInt(lengthHeader) : undefined;
        // can't think of a way a user would send an empty body for a payload but if they meant to do it don't spam them with errors...
        if (length === 0) {
            return;
        }
        if (length === undefined) {
            logger.warn(`${origin} is not sending a well-formatted request. It does not have valid headers (application/json - text/*) OR it is missing content-length header: Content-Type => '${req.header('content-type')}' | Length => ${length}`);
        } else {
            logger.warn(`${origin} is not sending a request with valid headers. Content-Type must be either application/json or a text/* wildcard (like text/plain) -- given: Content-Type => '${req.header('content-type')}'`);
        }
        res.status(400).send('Invalid Content-Type. Must be either application/json or a text wildcard (like text/plain)');
        return;
    }
    next();
}

export interface ComponentAwareRequest extends Request {
    component: AbstractSource | AbstractScrobbleClient
}

export const makeComponentMiddle = (sources: ScrobbleSources, clients: ScrobbleClients): TypedMiddleware<{component: ComponentAwareRequest['component']}> => (req, res, next) => {
    const {
        params: {
            id
        }
    } = req;

    const componentId = Number.parseInt(id as string);
    if (isNaN(componentId)) {
        res.status(400).json({ error: 'Component id must be a number' });
        return;
    }

    let component: AbstractSource | AbstractScrobbleClient | undefined;
    component = sources.sources.find(x => x.componentId === componentId);
    if (component === undefined) {
        component = clients.clients.find(x => x.componentId === componentId);
    }

    if(component === undefined) {
        res.status(404).json({error: `No Component with the Id ${componentId} exists`});
        return;
    }

    (req as ComponentAwareRequest).component = component;

    next();
}

export interface SourceAwareRequest extends Request {
    component: AbstractSource
}
export interface ClientAwareRequest extends Request {
    component: AbstractScrobbleClient
}

export const makeSourceNextMiddle = (sources: ScrobbleSources): TypedMiddleware<{component: AbstractSource}> => async (req: Request, res: Response, next: NextFunction) => {
    const {
        params: {
            id
        }
    } = req;

    const componentId = Number.parseInt(id as string);
    if (isNaN(componentId)) {
       res.status(400).json({ error: 'Source Id must be a number' });
       return;
    }

    const component: AbstractSource | undefined = sources.sources.find(x => x.componentId === componentId);
    if(component === undefined) {
        res.status(404).json({error: `No Source with the Id ${componentId} exists`});
        return;
    }

    (req as SourceAwareRequest).component = component;

    next();
}

export const makeClientNextMiddle = (clients: ScrobbleClients): TypedMiddleware<{component: AbstractScrobbleClient}> => async (req: Request, res: Response, next: NextFunction) => {
    const {
        params: {
            id
        }
    } = req;

    const componentId = Number.parseInt(id as string);
    if (isNaN(componentId)) {
        res.status(400).json({ error: 'Source Id must be a number' });
        return;
    }

    const component: AbstractScrobbleClient | undefined = clients.clients.find(x => x.componentId === componentId);
    if(component === undefined) {
        res.status(404).json({error: `No Client with the Id ${componentId} exists`});
        return;
    }

    (req as ClientAwareRequest).component = component;

    next();
}
/**
 * Tracks a server-level fault (an error whose effect on the web server is unknown).
 * Once faulted the server falls back to safe mode: a small, known scope of behavior until restart.
 *
 * Code that can handle its own errors should do so and never report here.
 * */
export class WebFault {
    fault?: {error: Error, at: Date};
    /** set during app shutdown so the server closing is not mistaken for a fault */
    closing: boolean = false;

    protected logger: Logger;
    protected onFault?: (err: Error) => void;

    constructor(logger: Logger, onFault?: (err: Error) => void) {
        this.logger = logger;
        this.onFault = onFault;
    }

    report = (err: Error) => {
        if(this.fault !== undefined) {
            this.logger.error(new Error('Web server encountered another error while in safe mode', {cause: err}));
            return;
        }
        this.fault = {error: err, at: new Date()};
        this.logger.error(new Error('Web server encountered an unrecoverable error and has entered safe mode. multi-scrobbler must be restarted to restore the API and dashboard.', {cause: err}));
        this.onFault?.(err);
    }
}

const SAFE_MODE_ALLOWED = ['/api/health', '/health', '/api/version'];

export const safeModeMiddleware = (webFault: WebFault): RequestHandler => (req, res, next) => {
    if(webFault.fault === undefined || SAFE_MODE_ALLOWED.includes(req.path)) {
        next();
        return;
    }
    res.status(503).json({
        error: 'Web server encountered an unrecoverable error. multi-scrobbler must be restarted. Scrobbling from non-ingress sources continues.',
        cause: webFault.fault.error.message,
        at: webFault.fault.at.toISOString()
    });
}

/** Replaces express's default handler (console.error) so request errors reach the app logger */
export const errorHandlerMiddleware = (logger: Logger): ErrorRequestHandler => (err, req, res, next) => {
    logger.error(new Error(`Unhandled error during ${req.method} ${req.path}`, {cause: err}));
    if(res.headersSent) {
        // response is partially written and can't be completed, same as express's default handler
        // (not calling next(err) since that would log again via console.error)
        req.socket.destroy();
        return;
    }
    res.status(500).json({error: 'An unexpected error occurred while handling this request'});
}

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

export interface SameOriginOptions {
    /** use X-Forwarded-Host as the request host */
    trustProxy?: boolean
}

/**
 * CSRF protection for cookie-authenticated, state-changing requests: a browser request must come from the same origin as the host it is sent to.
 *
 * better-auth has its own origin check but it is disabled when allowedHosts is open ('*') because every origin is then trusted.
 * This also protects MS's own API routes, which better-auth knows nothing about.
 *
 * Requests without Origin/Referer (scripts, curl, external services) are allowed since they do not carry a browser's ambient cookies.
 * */
export const sameOriginMiddleware = (opts: SameOriginOptions = {}): RequestHandler => (req, res, next) => {
    if (SAFE_METHODS.includes(req.method)) {
        next();
        return;
    }
    const fetchSite = req.get('sec-fetch-site');
    if (fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'none') {
        res.status(403).json({error: 'Cross-site request blocked', code: 'cross_site'});
        return;
    }
    const source = req.get('origin') ?? req.get('referer');
    if (source === undefined) {
        next();
        return;
    }
    const forwarded = opts.trustProxy ? req.get('x-forwarded-host')?.split(',')[0]?.trim() : undefined;
    const host = forwarded !== undefined && forwarded !== '' ? forwarded : req.get('host');
    let sourceHost: string | undefined;
    try {
        sourceHost = new URL(source).host;
    } catch {
        sourceHost = undefined;
    }
    if (sourceHost === undefined || host === undefined || sourceHost.toLowerCase() !== host.toLowerCase()) {
        res.status(403).json({error: 'Request origin does not match host', code: 'origin_mismatch'});
        return;
    }
    next();
}

/** Request header MS sets (overwriting anything the client sent) with the client IP, for better-auth's rate limiter */
export const CLIENT_IP_HEADER = 'x-ms-client-ip';

/**
 * Resolve the client IP for better-auth (rate limiting, session IP) without trusting client-supplied headers.
 *
 * * Without trustProxy: the connection's remote address
 * * With trustProxy: the right-most X-Forwarded-For entry, which is the one the proxy in front of MS appended
 *   (entries to its left can be forged by the client). Behind several chained proxies this is the outer proxy's address,
 *   which over-limits (shared bucket) rather than allowing a bypass.
 * */
export const clientIpMiddleware = (opts: SameOriginOptions = {}): RequestHandler => (req, res, next) => {
    let ip: string | undefined;
    if (opts.trustProxy) {
        ip = req.get('x-forwarded-for')?.split(',').map(x => x.trim()).filter(x => x !== '').at(-1);
    }
    ip ??= req.socket.remoteAddress;
    if (ip?.startsWith('::ffff:')) {
        ip = ip.slice(7);
    }
    if (ip === undefined) {
        delete req.headers[CLIENT_IP_HEADER];
    } else {
        req.headers[CLIENT_IP_HEADER] = ip;
    }
    next();
}

/**
 * Baseline security headers for every response
 *
 * * no framing (clickjacking of a logged in dashboard)
 * * no MIME sniffing
 * * no Referer to other origins (third-party auth callback URLs carry codes in their query string)
 * */
export const securityHeadersMiddleware: RequestHandler = (req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
}

/** Timing-safe string comparison */
export const secretMatches = (expected: string, given: string | undefined): boolean => {
    if (given === undefined) {
        return false;
    }
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    return a.length === b.length && timingSafeEqual(a, b);
}

/** Require `Authorization: Bearer <token>` (e.g. for Prometheus scraping with a static token) */
export const bearerTokenMiddleware = (token: string): RequestHandler => (req, res, next) => {
    const [scheme, given] = (req.get('authorization') ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !secretMatches(token, given)) {
        res.setHeader('WWW-Authenticate', 'Bearer');
        res.status(401).json({error: 'Bearer token required', code: 'auth_required'});
        return;
    }
    next();
}
