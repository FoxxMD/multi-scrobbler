import type {Logger} from "@foxxmd/logging";
import type ScrobbleClients from "../scrobblers/ScrobbleClients.ts";
import type ScrobbleSources from "../sources/ScrobbleSources.ts";
import type {Request, Response, NextFunction, ErrorRequestHandler, RequestHandler} from "express";
import type AbstractSource from "../sources/AbstractSource.ts";
import type AbstractScrobbleClient from "../scrobblers/AbstractScrobbleClient.ts";
import type { TypedMiddleware } from "@minisylar/express-typed-router";

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
