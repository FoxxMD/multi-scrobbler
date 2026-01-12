import { KoitoClientAIOConfig, KoitoClientConfig } from "./koito.js";
import { LastfmClientAIOConfig, LastfmClientConfig } from "./lastfm.js";
import { ListenBrainzClientAIOConfig, ListenBrainzClientConfig } from "./listenbrainz.js";
import { MalojaClientAIOConfig, MalojaClientConfig } from "./maloja.js";
import { TealClientAIOConfig, TealClientConfig } from "./tealfm.js";
import { RockSkyClientAIOConfig, RockSkyClientConfig } from "./rocksky.js";
import { LibrefmClientConfig, LibrefmClientAIOConfig } from "./librefm.js";

export type ClientConfig = MalojaClientConfig | LastfmClientConfig | LibrefmClientConfig | ListenBrainzClientConfig | KoitoClientConfig | TealClientConfig | RockSkyClientConfig;

export type ClientAIOConfig = MalojaClientAIOConfig | LastfmClientAIOConfig | LibrefmClientAIOConfig | ListenBrainzClientAIOConfig | KoitoClientAIOConfig | TealClientAIOConfig | RockSkyClientAIOConfig;
