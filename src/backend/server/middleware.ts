import { Logger } from "@foxxmd/logging";
import { ExpressHandler } from "../common/infrastructure/Atomic.js";

export const makeSourceCheckMiddle = (sources: any) => (required: boolean ): ExpressHandler => (req: any, res: any, next: any) => {
    const {
        query: {
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            name,
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            type
        } = {}
    } = req;

    if (required && name === undefined) {
        return res.status(404).send('Source name must be defined');
    } else if(name !== undefined) {
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
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
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
}
