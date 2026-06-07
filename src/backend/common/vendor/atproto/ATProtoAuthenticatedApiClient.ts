import { AbstractATProtoApiClient } from "./AbstractATProtoApiClient.js";

export abstract class ATProtoAuthenticatedApiClient extends AbstractATProtoApiClient {
    abstract restoreSession(): Promise<boolean>;
}