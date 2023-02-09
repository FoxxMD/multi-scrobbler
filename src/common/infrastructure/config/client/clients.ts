import {MalojaClientAIOConfig, MalojaClientConfig} from "./maloja";
import {LastfmClientAIOConfig, LastfmClientConfig} from "./lastfm";

export type ClientConfig = MalojaClientConfig | LastfmClientConfig;

export type ClientAIOConfig = MalojaClientAIOConfig | LastfmClientAIOConfig;
