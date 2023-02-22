import {MalojaClientAIOConfig, MalojaClientConfig} from "./maloja.js";
import {LastfmClientAIOConfig, LastfmClientConfig} from "./lastfm.js";

export type ClientConfig = MalojaClientConfig | LastfmClientConfig;

export type ClientAIOConfig = MalojaClientAIOConfig | LastfmClientAIOConfig;
