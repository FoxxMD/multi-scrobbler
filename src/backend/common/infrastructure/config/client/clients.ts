import { KoitoClientAIOConfig, KoitoClientConfig } from "./koito.js";
import { LastfmClientAIOConfig, LastfmClientConfig } from "./lastfm.js";
import { ListenBrainzClientAIOConfig, ListenBrainzClientConfig } from "./listenbrainz.js";
import { MalojaClientAIOConfig, MalojaClientConfig } from "./maloja.js";
import { TealClientAIOConfig, TealClientConfig } from "./tealfm.js";
import { RockSkyClientAIOConfig, RockSkyClientConfig } from "./rocksky.js";

export type ClientConfig = MalojaClientConfig | LastfmClientConfig | ListenBrainzClientConfig | KoitoClientConfig | TealClientConfig | RockSkyClientConfig;

export type ClientAIOConfig = MalojaClientAIOConfig | LastfmClientAIOConfig | ListenBrainzClientAIOConfig | KoitoClientAIOConfig | TealClientAIOConfig | RockSkyClientAIOConfig;
