import { RockskyClient } from "@rocksky/sdk";
import { ElementOf } from "ts-essentials";

export type RockskyScrobble = ElementOf<Awaited<ReturnType<RockskyClient['scrobble']['getScrobbles']>>['scrobbles']>;