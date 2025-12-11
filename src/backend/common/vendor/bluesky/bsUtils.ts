import { Handle } from "@atcute/lexicons";
import { isHandle } from "@atcute/lexicons/syntax";
import { Logger } from "@foxxmd/logging";
import { parseRegexSingle } from "@foxxmd/regex-buddy-core";
import { MaybeLogger } from "../../logging.js";
import { AtprotoDid } from "@atproto/oauth-client-node";

export const HANDLE_REGEX = new RegExp(/.+\..+/);
export const ATSIGN_REGEX = new RegExp(/^@(.+)/);
export const DID_REGEX = new RegExp(/did:(?:plc|web):.+/);

export interface HandleOptions {
    logger?: Logger
    defaultDomain?: string
}

export const isDID = (str: string): str is AtprotoDid => DID_REGEX.test(str);

export const identifierToAtProtoHandle = (str: string, options: HandleOptions = {}): Handle => {
    if(isHandle(str)) {
        return str;
    }

    const logger = new MaybeLogger(options.logger);

    let cleanHandle: string = str;

    const atRes = parseRegexSingle(ATSIGN_REGEX, str);
    if(atRes !== undefined) {
        logger.warn(`Handle '${cleanHandle}' has '@' at beginning, removing this.`);
        cleanHandle = atRes.groups[0];
    }

    if(undefined == parseRegexSingle(HANDLE_REGEX, cleanHandle)) {
        if(options.defaultDomain === undefined) {
            throw new Error(`No domain found for ATProto handle '${cleanHandle}'`);
        }

        const fqId = `${cleanHandle}.${options.defaultDomain}`;
        logger.warn(`Handle '${cleanHandle}' was not in the form 'handle.TLD', assuming this is a Bluesky account and appending TLD: ${fqId}`);
        cleanHandle = fqId;
    }

    if(isHandle(cleanHandle)) {
        return cleanHandle;
    }
    throw new Error(`Identifier ${cleanHandle} is not a valid ATProto handle`);
}