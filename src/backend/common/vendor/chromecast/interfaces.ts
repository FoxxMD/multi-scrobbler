import {createPlatform, MediaController, PersistentClient} from "@foxxmd/chromecast-client";
import {Service} from "bonjour-service";
import { FormatPlayObjectOptions } from "../../infrastructure/Atomic.js";
import {Dayjs} from "dayjs";
import {Logger} from "@foxxmd/winston";

export type PlatformType = ReturnType<typeof createPlatform>;
export interface PlatformApplication {
    iconUrl?: string | null | undefined;
    isIdleScreen?: boolean | null | undefined;
    launchedFromCloud?: boolean | null | undefined;
    statusText?: string | null | undefined;
    appId: string;
    displayName: string;
    namespaces: {
        name: string;
    }[];
    sessionId: string;
    transportId: string;
}

export interface PlatformApplicationWithContext extends PlatformApplication {
    filtered: boolean
    controller?: MediaController.MediaController
    stale: boolean
    staleAt?: Dayjs | undefined
    badData: boolean
    badDataAt?: Dayjs | undefined
    validAppType: boolean
    playerId: string
    logger: Logger
    lastPlayHash?: string
}

export interface ChromecastFormatPlayObjectOptions extends FormatPlayObjectOptions {
    deviceId: string
    source: string
}
