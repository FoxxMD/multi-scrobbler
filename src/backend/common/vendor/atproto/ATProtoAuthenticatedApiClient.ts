import { AbstractATProtoApiClient } from "./AbstractATProtoApiClient.ts";

export abstract class ATProtoAuthenticatedApiClient extends AbstractATProtoApiClient {
    abstract restoreSession(): Promise<boolean>;
}