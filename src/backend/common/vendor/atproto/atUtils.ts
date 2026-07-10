import type { Handle } from "@atcute/lexicons";
import { isHandle, type AtprotoDid } from "@atcute/lexicons/syntax";
import type { Logger } from "@foxxmd/logging";
import { parseRegexSingle } from "@foxxmd/regex-buddy-core";
import { loggerNoop, MaybeLogger } from '../../MaybeLogger.ts';
import type { ATProtoUserIdentifierData, HandleData } from "../../infrastructure/config/client/atproto.ts";
import type { Cacheable } from "cacheable";
import {
    CompositeDidDocumentResolver,
    CompositeHandleResolver,
    DohJsonHandleResolver,
    PlcDidDocumentResolver,
    WebDidDocumentResolver,
    WellKnownHandleResolver,
} from "@atcute/identity-resolver";
import {
    getPdsEndpoint,
    getAtprotoHandle,
    isAtprotoDid,
} from '@atcute/identity';
import assert from "node:assert";
import { isPortReachableConnect, normalizeWebAddress } from "../../../utils/NetworkUtils.ts";
import { isNodeNetworkException } from "../../errors/NodeErrors.ts";

export const HANDLE_REGEX = new RegExp(/.+\..+/);
export const ATSIGN_REGEX = new RegExp(/^@(.+)/);
export const DID_REGEX = new RegExp(/did:(?:plc|web):.+/);

export interface HandleOptions {
    logger?: Logger
    defaultDomain?: string
}

export const isDID = (str: string): str is AtprotoDid => DID_REGEX.test(str);

export const identifierToAtProtoHandle = (str: string, options: HandleOptions = {}): Handle => {
    if (isHandle(str)) {
        return str;
    }

    const logger = new MaybeLogger(options.logger);

    let cleanHandle: string = str;

    const atRes = parseRegexSingle(ATSIGN_REGEX, str);
    if (atRes !== undefined) {
        logger.warn(`Handle '${cleanHandle}' has '@' at beginning, removing this.`);
        cleanHandle = atRes.groups[0];
    }

    if (undefined == parseRegexSingle(HANDLE_REGEX, cleanHandle)) {
        if (options.defaultDomain === undefined) {
            throw new Error(`No domain found for ATProto handle '${cleanHandle}'`);
        }

        const fqId = `${cleanHandle}.${options.defaultDomain}`;
        logger.warn(`Handle '${cleanHandle}' was not in the form 'handle.TLD', assuming this is a Bluesky account and appending TLD: ${fqId}`);
        cleanHandle = fqId;
    }

    if (isHandle(cleanHandle)) {
        return cleanHandle;
    }
    throw new Error(`Identifier ${cleanHandle} is not a valid ATProto handle`);
}

export interface IdentifyOptions {
    logger?: Logger
    cache?: Cacheable
}

export const getATProtoIdentifier = async (data: ATProtoUserIdentifierData, opts: IdentifyOptions = {}): Promise<HandleData> => {

    const {
        logger = loggerNoop,
        cache
    } = opts;

    const key = [data.did, data.identifier].filter(x => x !== undefined).join('-');

    let hd: HandleData;
    if (cache !== undefined) {
        hd = await cache.get<HandleData>(`${key}-handleData`);
        if (hd !== undefined) {
            logger.debug('Found cached handle data');
            return hd;
        } else {
            logger.debug('Handle data not cached, attempting to resolve...');
        }
    }


    const handleResolver = new CompositeHandleResolver({
        strategy: "race",
        methods: {
            dns: new DohJsonHandleResolver({
                dohUrl: "https://mozilla.cloudflare-dns.com/dns-query",
            }),
            http: new WellKnownHandleResolver(),
        },
    });

    const {
        did: givenDid,
        identifier
    } = data;

    let did: AtprotoDid;
    if (givenDid === undefined) {
        try {
            did = await handleResolver.resolve(identifier as `${string}.${string}`);
            logger.debug(`Resolved ${did}`);
        } catch (e) {
            throw new Error('Unable to resolve handle', { cause: e });
        }
    } else {
        assert(isAtprotoDid(givenDid), `Given DID is not an ATProto DID: ${givenDid}`);
        did = givenDid;
    }

    const docResolver = new CompositeDidDocumentResolver({
        methods: {
            plc: new PlcDidDocumentResolver(),
            web: new WebDidDocumentResolver(),
        },
    });

    let doc: Awaited<ReturnType<typeof docResolver.resolve>>;
    try {
        doc = await docResolver.resolve(did);
    } catch (e) {
        throw new Error('Unable to resolve did document', { cause: e });
    }
    if (doc.service === undefined || doc.service.length === 0) {
        throw new Error('did document did not return a service');
    }

    if (typeof doc.service[0].serviceEndpoint !== 'string') {
        throw new Error(`Do not know how to handle this serviceEndpoint data structure!\n${JSON.stringify(doc.service[0].serviceEndpoint)}`);
    }
    hd = { did, pds: getPdsEndpoint(doc), handle: getAtprotoHandle(doc) };

    if (cache !== undefined) {
        cache.set(`${key}-handleData`, hd, '1d');
    }

    return hd;
}

export const checkPds = async (data: ATProtoUserIdentifierData, opts: IdentifyOptions): Promise<true> => {
    let hd: HandleData;
    try {
        hd = await getATProtoIdentifier(data, opts);
    } catch (e) {
        throw new Error('Unable to get handle data', { cause: e });
    }

    const normal = normalizeWebAddress(hd.pds);

    try {
        await isPortReachableConnect(normal.port, { host: normal.url.hostname });
        return true;
    } catch (e) {
        if (isNodeNetworkException(e)) {
            throw new Error('Could not communicate with PDS server', { cause: e });
        }
        throw new Error('Unexpected error when trying to communicate with PDS server', { cause: e });
    }
}