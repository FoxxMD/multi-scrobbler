export const makeSourceCheckMiddle = sources => (req, res, next) => {
    const {
        query: {
            name
        } = {}
    } = req;

    if (name === undefined) {
        return res.status(404).send('Source name must be defined');
    }

    const source = sources.getByName(name);

    if (source === undefined) {
        return res.status(404).send(`No source with the name: ${name}`);
    }

    req.sourceName = name;
    req.scrobbleSource = source;
    next();
}

export const makeClientCheckMiddle = clients => (req, res, next) => {
    const {
        query: {
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
