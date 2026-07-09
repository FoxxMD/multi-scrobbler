import { createPlatform, MediaController } from "@foxxmd/chromecast-client";
import { type Logger } from "@foxxmd/logging";
import { type Dayjs } from "dayjs";
import { type FormatPlayObjectOptions } from "../../infrastructure/Atomic.ts";

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
