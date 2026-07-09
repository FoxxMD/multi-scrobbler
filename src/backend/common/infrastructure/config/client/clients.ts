import { type KoitoClientAIOConfig, type KoitoClientConfig } from "./koito.ts";
import { type LastfmClientAIOConfig, type LastfmClientConfig } from "./lastfm.ts";
import { type ListenBrainzClientAIOConfig, type ListenBrainzClientConfig } from "./listenbrainz.ts";
import { type MalojaClientAIOConfig, type MalojaClientConfig } from "./maloja.ts";
import { type TealClientAIOConfig, type TealClientConfig } from "./tealfm.ts";
import { type RockSkyClientAIOConfig, type RockSkyClientConfig } from "./rocksky.ts";
import { type LibrefmClientConfig, type LibrefmClientAIOConfig } from "./librefm.ts";
import { type DiscordClientAIOConfig, type DiscordClientConfig } from "./discord.ts";

export type ClientConfig = 
MalojaClientConfig 
| LastfmClientConfig 
| LibrefmClientConfig 
| ListenBrainzClientConfig 
| KoitoClientConfig 
| TealClientConfig 
| RockSkyClientConfig 
| DiscordClientConfig;

export type ClientAIOConfig = MalojaClientAIOConfig 
| LastfmClientAIOConfig 
| LibrefmClientAIOConfig 
| ListenBrainzClientAIOConfig 
| KoitoClientAIOConfig 
| TealClientAIOConfig 
| RockSkyClientAIOConfig 
| DiscordClientAIOConfig;

/** Used for docusaurus schemas
 *  We need to show "array of" for each type of config when looking at File Config
 * 
 *  This is defined in the AIO config and we *assume* arrays in individual files when parsing in builders
 *  But we don't have any actual definitions for this that we can pull for generating individual schema files
 */
export type MalojaClientConfigs = MalojaClientConfig[];
export type LastfmClientConfigs = LastfmClientConfig[];
export type LibrefmClientConfigs = LibrefmClientConfig[];
export type ListenBrainzClientConfigs = ListenBrainzClientConfig[];
export type KoitoClientConfigs = KoitoClientConfig[];
export type TealClientConfigs = TealClientConfig[];
export type RockSkyClientConfigs = RockSkyClientConfig[];
export type DiscordClientConfigs = DiscordClientConfig[];

export const atomicClientInterfaces = [
    'MalojaClientConfig',
    'LastfmClientConfig',
    'LibrefmClientConfig',
    'ListenBrainzClientConfig',
    'KoitoClientConfig',
    'TealClientConfig',
    'RockSkyClientConfig',
    'DiscordClientConfig'
];

export const clientInterfaces = [
    'AIOClientRelaxedConfig',
    ...atomicClientInterfaces
];

export type ClientType =
    'maloja'
    | 'lastfm'
    | 'librefm'
    | 'listenbrainz'
    | 'koito'
    | 'tealfm'
    | 'rocksky'
    | 'discord';
    
export const clientTypes: ClientType[] = [
    'maloja',
    'lastfm',
    'librefm',
    'listenbrainz',
    'koito',
    'tealfm',
    'rocksky',
    'discord'
];