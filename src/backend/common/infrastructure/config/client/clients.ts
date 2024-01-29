import { MalojaClientAIOConfig, MalojaClientConfig } from "./maloja.js";
import { LastfmClientAIOConfig, LastfmClientConfig } from "./lastfm.js";
import { ListenBrainzClientAIOConfig, ListenBrainzClientConfig } from "./listenbrainz.js";

export type ClientConfig = MalojaClientConfig | LastfmClientConfig | ListenBrainzClientConfig;

export type ClientAIOConfig = MalojaClientAIOConfig | LastfmClientAIOConfig | ListenBrainzClientAIOConfig;
