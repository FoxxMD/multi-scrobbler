import { type Logger } from "@foxxmd/logging";
import { type ExpressHandler } from "../common/infrastructure/Atomic.js";
import ScrobbleClients from "../scrobblers/ScrobbleClients.js";
import ScrobbleSources from "../sources/ScrobbleSources.js";
import { type Request, type Response, type NextFunction } from "express";
import AbstractSource from "../sources/AbstractSource.js";
import AbstractScrobbleClient from "../scrobblers/AbstractScrobbleClient.js";

export const makeSourceCheckMiddle = (sources: any) => (required: boolean): ExpressHandler => (req: any, res: any, next: any) => {
    const {
        query: {
            name,
            type
        } = {}
    } = req;

    if (required && name === undefined) {
        return res.status(404).send('Source name must be defined');
    } else if (name !== undefined) {
        const source = sources.getByNameAndType(name, type);

        if (source === undefined) {
            return res.status(404).send(`No source with the name [${name}] and type [${type}`);
        }

        req.sourceName = name;
        req.scrobbleSource = source;
    }

    next();
}

export const makeClientCheckMiddle = (clients: any) => (required: boolean): ExpressHandler => (req: any, res: any, next: any) => {
    const {
        query: {
            name
        } = {}
    } = req;

    if (required && name === undefined) {
        return res.status(404).send('Client name must be defined');
    } else if (name !== undefined) {
        const client = clients.getByName(name);

        if (client === undefined) {
            return res.status(404).send(`No client with the name: ${name}`);
        }

        req.scrobbleClient = client;
    }

    next();
}

export const nonEmptyBody = (logger: Logger, origin: string = 'Origin'): ExpressHandler => async (req, res, next) => {
    const bodyEmpty = req.body === undefined || req.body === null || (typeof req.body === 'object' && Object.keys(req.body).length === 0);
    if (bodyEmpty) {
        const length = req.header('content-length') !== undefined ? Number.parseInt(req.header('content-length')) : undefined;
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

export const makeComponentMiddle = (sources: ScrobbleSources, clients: ScrobbleClients): ExpressHandler => async (req: Request, res: Response, next: NextFunction) => {
    const {
        params: {
            componentVal
        }
    } = req;

    const componentId = Number.parseInt(componentVal as string);
    if (isNaN(componentId)) {
        return res.status(400).json({ error: 'Component id must be a number' });
    }

    let component: AbstractSource | AbstractScrobbleClient;
    component = sources.sources.find(x => x.componentId === componentId);
    if (component === undefined) {
        component = clients.clients.find(x => x.componentId === componentId);
    }

    if(component === undefined) {
        return res.status(404).json({error: `No Component with the Id ${componentId} exists`});
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

export const makeSourceNextMiddle = (sources: ScrobbleSources): ExpressHandler => async (req: Request, res: Response, next: NextFunction) => {
    const {
        params: {
            componentVal
        }
    } = req;

    const componentId = Number.parseInt(componentVal as string);
    if (isNaN(componentId)) {
        return res.status(400).json({ error: 'Source Id must be a number' });
    }

    let component: AbstractSource;
    component = sources.sources.find(x => x.componentId === componentId);
    if(component === undefined) {
        return res.status(404).json({error: `No Source with the Id ${componentId} exists`});
    }

    (req as SourceAwareRequest).component = component;

    next();
}

export const makeClientNextMiddle = (clients: ScrobbleClients): ExpressHandler => async (req: Request, res: Response, next: NextFunction) => {
    const {
        params: {
            componentVal
        }
    } = req;

    const componentId = Number.parseInt(componentVal as string);
    if (isNaN(componentId)) {
        return res.status(400).json({ error: 'Source Id must be a number' });
    }

    let component: AbstractScrobbleClient;
    component = clients.clients.find(x => x.componentId === componentId);
    if(component === undefined) {
        return res.status(404).json({error: `No Client with the Id ${componentId} exists`});
    }

    (req as ClientAwareRequest).component = component;

    next();
}