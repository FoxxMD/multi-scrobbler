import { KoitoClientAIOConfig, KoitoClientConfig } from "./koito.js";
import { LastfmClientAIOConfig, LastfmClientConfig } from "./lastfm.js";
import { ListenBrainzClientAIOConfig, ListenBrainzClientConfig } from "./listenbrainz.js";
import { MalojaClientAIOConfig, MalojaClientConfig } from "./maloja.js";

export type ClientConfig = MalojaClientConfig | LastfmClientConfig | ListenBrainzClientConfig | KoitoClientConfig;

export type ClientAIOConfig = MalojaClientAIOConfig | LastfmClientAIOConfig | ListenBrainzClientAIOConfig | KoitoClientAIOConfig;
