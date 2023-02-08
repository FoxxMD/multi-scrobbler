export const makeSourceCheckMiddle = (sources: any) => (req: any, res: any, next: any) => {
    const {
        query: {
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            name,
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            type
        } = {}
    } = req;

    if (name === undefined) {
        return res.status(404).send('Source name must be defined');
    }

    const source = sources.getByNameAndType(name, type);

    if (source === undefined) {
        return res.status(404).send(`No source with the name [${name}] and type [${type}`);
    }

    req.sourceName = name;
    req.scrobbleSource = source;
    next();
}

export const makeClientCheckMiddle = (clients: any) => (req: any, res: any, next: any) => {
    const {
        query: {
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            name
        } = {}
    } = req;

    if (name === undefined) {
        return res.status(404).send('Client name must be defined');
    }

    const client = clients.getByName(name);

    if (client === undefined) {
        return res.status(404).send(`No client with the name: ${name}`);
    }

    req.scrobbleClient = client;
    next();
}
