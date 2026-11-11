import type { PlayObject, OptionalCacheUsage } from "../../../../core/Atomic.ts";
import type { SearchTerm } from "../../../../core/Transform.ts"
import { testWhenConditions } from "../../../utils/PlayTransformUtils.ts";
import type { WebhookPayload } from "../../infrastructure/config/health/webhooks.ts";
import AbstractTransformer from "../AbstractTransformer.ts"
import { actionRulesUnitSchema, actionStageSchema, type ActionStage, type ActionType } from "./ActionTransformerUtil.ts"

const actionRuleKeys = actionRulesUnitSchema.keyof();

export default class ActionTransformer extends AbstractTransformer<SearchTerm, ActionStage> {

    protected readonly stageSchema = actionStageSchema;

    /** A rule is enabled if it is defined, not false, and any `when` condition it has is met */
    protected ruleEnabled(play: PlayObject, name: string, part: unknown): boolean {
        if (part === undefined || part === null || part === false) {
            return false;
        }
        if (typeof part === 'object' && !Array.isArray(part) && 'when' in part && part.when !== undefined) {
            if (!testWhenConditions(part.when as Parameters<typeof testWhenConditions>[0], play, { testMaybeRegex: this.regex.testMaybeRegex })) {
                this.logger.debug(`When condition for ${name} not met, will not use it`);
                return false;
            }
        }
        return true;
    }

    /** Stage terms are applied first, then terms from transformer `defaults` */
    protected doParseConfig(data: ActionStage): ActionStage {
        const defaults = actionStageSchema.parse(this.config.defaults ?? {});
        const {
            title = [],
            artists = [],
            album = [],
            albumArtists = [],
            deviceId = [],
            library = [],
            user = [],
            musicService = [],
            playlist = [],
            matches = [],
        } = data;
        return {
            ...data,
            title: [...title, ...(defaults.title ?? [])],
            artists: [...artists, ...(defaults.artists ?? [])],
            album: [...album, ...(defaults.album ?? [])],
            albumArtists: [...albumArtists, ...(defaults.albumArtists ?? [])],
            deviceId : [...deviceId, ...(defaults.deviceId ?? [])],
            library: [...library, ...(defaults.library ?? [])],
            user: [...user, ...(defaults.user ?? [])],
            musicService: [...musicService, ...(defaults.musicService ?? [])],
            playlist: [...playlist, ...(defaults.playlist ?? [])],
            matches: [...matches, ...(defaults.matches ?? [])]
        };
    }

    protected async doHandle(parts: ActionStage, play: PlayObject, transformData: string, opts?: OptionalCacheUsage): Promise<PlayObject> {
        const {
            throwOnFailure = false,
        } = this.config.options || {};

        let state: ActionType;
        prop:
        for(const [key, val] of Object.entries(parts)) {
            if(actionRuleKeys.validate(key) && this.ruleEnabled(play, key, val)) {
                switch(key) {
                    case 'deviceId':
                        state = 'approve';
                        break prop;
                }
            }
        }
    }

    public async notify(payload: WebhookPayload): Promise<void> {
        return;
    }
}