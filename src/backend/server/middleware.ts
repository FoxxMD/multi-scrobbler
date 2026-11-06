import type {Logger} from "@foxxmd/logging";
import type ScrobbleClients from "../scrobblers/ScrobbleClients.ts";
import type ScrobbleSources from "../sources/ScrobbleSources.ts";
import type {Request, Response, NextFunction, ErrorRequestHandler, RequestHandler} from "express";
import type AbstractSource from "../sources/AbstractSource.ts";
import type AbstractScrobbleClient from "../scrobblers/AbstractScrobbleClient.ts";
import type { TypedMiddleware } from "@minisylar/express-typed-router";
import { timingSafeEqual } from "node:crypto";
import { BlockList, isIP, isIPv4 } from "node:net";
import type { AuthSettings } from "../common/auth/authSettings.ts";
import type { PublicDashboardEmbed } from "../../core/UserSettings.ts";

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
    if (fetchSite === 'same-origin') {
        // set by the browser and cannot be changed by page scripts. Trusting it means a proxy that rewrites Host
        // (nginx's default) does not break the dashboard. Origin/Host comparison below is the fallback for older browsers
        next();
        return;
    }
    if (fetchSite !== undefined && fetchSite !== 'none') {
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
/** Request header MS sets (overwriting anything the client sent): '1' if the client looks like it is on the public internet, else '0' */
export const CLIENT_PUBLIC_HEADER = 'x-ms-client-public';

const privateNetworks = new BlockList();
for (const [net, prefix] of [['127.0.0.0', 8], ['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['100.64.0.0', 10], ['169.254.0.0', 16]] as const) {
    privateNetworks.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [['::1', 128], ['fc00::', 7], ['fe80::', 10]] as const) {
    privateNetworks.addSubnet(net, prefix, 'ipv6');
}

const stripMapped = (ip: string) => ip.toLowerCase().startsWith('::ffff:') && isIPv4(ip.slice(7)) ? ip.slice(7) : ip;

/**
 * Loopback, private (RFC1918, IPv6 unique local), CGNAT (Tailscale) or link-local address.
 * Anything that isn't a valid IP is not private.
 * */
export const isPrivateAddress = (address: string): boolean => {
    const ip = stripMapped(address.trim());
    const family = isIP(ip);
    return family !== 0 && privateNetworks.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

/** Host the client used: X-Forwarded-Host (with trustProxy) or Host */
export const requestHost = (getHeader: (name: string) => string | null | undefined, trustProxy: boolean): string | undefined => {
    const forwarded = trustProxy ? getHeader('x-forwarded-host')?.split(',')[0]?.trim() : undefined;
    return (forwarded !== undefined && forwarded !== '' ? forwarded : getHeader('host')?.trim()) || undefined;
}

/** name endings public DNS can't serve, so a malicious website can't use them for DNS rebinding */
const LOCAL_SUFFIXES = ['.local', '.lan', '.home.arpa', '.internal', '.localhost', '.ts.net'];

const hostPatternMatches = (pattern: string, host: string) =>
    new RegExp(`^${pattern.toLowerCase().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}$`).test(host);

/**
 * Whether a Host can't be a DNS rebinding attack: a malicious website pointing its own domain at this instance.
 *
 * Allowed: IP addresses, localhost, single-label names (nas), names ending in a local-only suffix (.local, .lan, .home.arpa, .internal, .ts.net),
 * the BASE_URL host and ALLOWED_HOSTS entries (when not open).
 * */
export const isRecognizedHost = (host: string | undefined, settings: Pick<AuthSettings, 'allowedHosts' | 'hostsOpen' | 'fallbackOrigin'>): boolean => {
    if (host === undefined) {
        return false;
    }
    const withPort = host.toLowerCase();
    // [::1]:9078 -> ::1, 192.168.0.1:9078 -> 192.168.0.1, nas:9078 -> nas
    const hostname = (withPort.startsWith('[') ? withPort.slice(1, withPort.indexOf(']')) : withPort.replace(/:\d+$/, '')).replace(/\.$/, '');
    if (hostname === '') {
        return false;
    }
    if (isIP(hostname) !== 0 || hostname === 'localhost' || !hostname.includes('.') || LOCAL_SUFFIXES.some(x => hostname.endsWith(x))) {
        return true;
    }
    try {
        if (new URL(settings.fallbackOrigin).hostname.toLowerCase() === hostname) {
            return true;
        }
    } catch {
        // not a valid origin, ignore
    }
    return !settings.hostsOpen && settings.allowedHosts.some(x => hostPatternMatches(x, withPort) || hostPatternMatches(x, hostname));
}

/**
 * Best guess at whether the client is on the public internet. Only a signal: it is used for warnings and to require the setup token, never to deny access.
 *
 * * trustProxy: the right-most X-Forwarded-For entry (or the connection) decides
 * * otherwise, a public connection address is public (a direct client can't fake it).
 *   A private connection address with X-Forwarded-For is probably a reverse proxy, so its right-most entry (appended by that proxy) decides.
 * */
export const isPublicClient = (req: Request, opts: SameOriginOptions = {}): boolean => {
    const forwarded = req.get('x-forwarded-for')?.split(',').map(x => x.trim()).filter(x => x !== '').at(-1);
    const socket = req.socket.remoteAddress;
    if (opts.trustProxy) {
        const ip = forwarded ?? socket;
        return ip !== undefined && !isPrivateAddress(ip);
    }
    if (socket === undefined) {
        return false;
    }
    if (!isPrivateAddress(socket)) {
        return true;
    }
    return forwarded !== undefined && !isPrivateAddress(forwarded);
}

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
    req.headers[CLIENT_PUBLIC_HEADER] = isPublicClient(req, opts) ? '1' : '0';
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

/**
 * Paths of the embeddable dashboard document (embed.html), matched exactly.
 * vite-express serves the full SPA (index.html) for anything else under /embed, like /embed/ or /embed/settings,
 * so a prefix match would make the logged in dashboard framable.
 * */
export const EMBED_PATHS = ['/embed', '/embed.html'];

/**
 * Allow framing of the embeddable dashboard document only, by the origins in its embed settings (any when none are set).
 *
 * `getEmbed` returns the embed settings, or undefined when embedding (or the public dashboard) is disabled, then the baseline DENY is kept.
 * Mount under the base path, after securityHeadersMiddleware. X-Frame-Options can't allowlist origins so it is removed and CSP frame-ancestors is used.
 * */
export const embedFramingMiddleware = (getEmbed: () => Promise<PublicDashboardEmbed | undefined>): RequestHandler => async (req, res, next) => {
    if (req.method !== 'GET' || !EMBED_PATHS.includes(req.path)) {
        next();
        return;
    }
    // a cached copy must never outlive (or be served with) different framing headers
    res.setHeader('Cache-Control', 'no-store');
    const embed = await getEmbed();
    if (embed !== undefined) {
        res.removeHeader('X-Frame-Options');
        res.setHeader('Content-Security-Policy', `frame-ancestors ${embed.ancestors !== undefined && embed.ancestors.length > 0 ? embed.ancestors.join(' ') : '*'}`);
    }
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
