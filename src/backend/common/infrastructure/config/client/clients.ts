import { KoitoClientAIOConfig, KoitoClientConfig } from "./koito.js";
import { LastfmClientAIOConfig, LastfmClientConfig } from "./lastfm.js";
import { ListenBrainzClientAIOConfig, ListenBrainzClientConfig } from "./listenbrainz.js";
import { MalojaClientAIOConfig, MalojaClientConfig } from "./maloja.js";
import { TealClientAIOConfig, TealClientConfig } from "./tealfm.js";

export type ClientConfig = MalojaClientConfig | LastfmClientConfig | ListenBrainzClientConfig | KoitoClientConfig | TealClientConfig;

export type ClientAIOConfig = MalojaClientAIOConfig | LastfmClientAIOConfig | ListenBrainzClientAIOConfig | KoitoClientAIOConfig | TealClientAIOConfig;
