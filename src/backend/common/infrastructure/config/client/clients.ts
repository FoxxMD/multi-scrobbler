import { LastfmClientAIOConfig, LastfmClientConfig } from "./lastfm.ts";
import { ListenBrainzClientAIOConfig, ListenBrainzClientConfig } from "./listenbrainz.ts";
import { MalojaClientAIOConfig, MalojaClientConfig } from "./maloja.ts";

export type ClientConfig = MalojaClientConfig | LastfmClientConfig | ListenBrainzClientConfig;

export type ClientAIOConfig = MalojaClientAIOConfig | LastfmClientAIOConfig | ListenBrainzClientAIOConfig;
