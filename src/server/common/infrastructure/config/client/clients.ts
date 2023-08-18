import { MalojaClientAIOConfig, MalojaClientConfig } from "./maloja";
import { LastfmClientAIOConfig, LastfmClientConfig } from "./lastfm";
import { ListenBrainzClientAIOConfig, ListenBrainzClientConfig } from "./listenbrainz";

export type ClientConfig = MalojaClientConfig | LastfmClientConfig | ListenBrainzClientConfig;

export type ClientAIOConfig = MalojaClientAIOConfig | LastfmClientAIOConfig | ListenBrainzClientAIOConfig;
