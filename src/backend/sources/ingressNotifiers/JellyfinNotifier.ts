import { Logger } from "@foxxmd/logging";
import { Request } from "express";
import { remoteHostIdentifiers, remoteHostStr } from "../../utils.ts";
import JellyfinSource from "../JellyfinSource.ts";
import { IngressNotifier } from "./IngressNotifier.ts";

export class JellyfinNotifier extends IngressNotifier {

    constructor(logger: Logger) {
        super('Jellyfin', logger);
    }

    seenServers: Record<string, string> = {};
    notifyBySource(req: Request, isRaw: boolean): [boolean, (string | undefined)] {
        if(!isRaw) {
            const parts = remoteHostIdentifiers(req);
            let serverIdentifier = `${parts.host}-${parts.proxy ?? ''}`;

            const playObj = JellyfinSource.formatPlayObj({...req.body, connectionId: serverIdentifier});

            const warnings = [];

            if(req.body.ServerName === undefined || req.body.ServerName === '') {
                if(req.body.ServerId !== undefined && req.body.ServerId !== '') {
                    warnings.push(`Webhook payload did not contain ServerName, will use ServerId (${req.body.ServerId}) instead`);
                    serverIdentifier = req.body.ServerId;
                } else {
                    warnings.push(`Webhook payload did not contain ServerName OR ServerId will use connection ID (${serverIdentifier}) instead`);
                }
            } else {
                serverIdentifier = playObj.meta.server;
            }

            if(this.seenServers[serverIdentifier] === undefined) {
                let version = req.body.ServerVersion;
                if(version === undefined || version === '') {
                    warnings.push('Webhook payload did not contain ServerVersion');
                    version = 'Unknown';
                }

                if(warnings.length > 0) {
                    this.logger.warn(`${remoteHostStr(req)} There is information missing from the Jellyfin webhook payload. Make sure 'Send all Properties' is checked in webhook: ${warnings.join(' | ')}`);
                }

                this.seenServers[serverIdentifier] = version;
                return [true, `Received valid data from server ${serverIdentifier} (Version ${version}) for the first time.`];
            }
        }
        return [true, undefined];
    }

    notifyByRequest(req: Request, isRaw: boolean): string | undefined {
        if(req.method !== 'POST') {
            return `Expected POST request (webhook payload) but received ${req.method}`;
        }
        return;
    }

}
