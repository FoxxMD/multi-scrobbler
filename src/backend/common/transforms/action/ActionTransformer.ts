import type { PlayObject, OptionalCacheUsage } from "../../../../core/Atomic.ts";
import type { SearchTerm } from "../../../../core/Transform.ts"
import { getPlayPartTester, type SuppliedPlayPartTesters, testWhenConditions } from "../../../utils/PlayTransformUtils.ts";
import type { WebhookPayload } from "../../infrastructure/config/health/webhooks.ts";
import AbstractTransformer from "../AbstractTransformer.ts"
import { actionRulesSchema, actionRulesUnitSchema, actionStageSchema, type ActionStage, type ActionStageRulesUnit, type ActionType } from "./ActionTransformerUtil.ts"

const ACTION_RULE_PARTS = actionRulesUnitSchema.keyof().options;
type ActionRulePart = typeof ACTION_RULE_PARTS[number];

/** Parsed test value (`search` of each term) for each Action rule part */
type ActionPartTests = { [K in ActionRulePart]: NonNullable<ActionStageRulesUnit[K]> extends SearchTerm<infer T>[] ? T : never };

export default class ActionTransformer extends AbstractTransformer<string, ActionStage> {

    protected readonly stageSchema = actionStageSchema;

    /** Testers for Action rule parts without a built-in tester, or to override them */
    protected readonly partTesters: SuppliedPlayPartTesters<ActionPartTests> = {};

    /** Any term matches (OR). A term with a `when` is only tested if its `when` matches */
    protected testTerms(play: PlayObject, part: ActionRulePart, terms: SearchTerm<unknown>[]): boolean {
        const tester = getPlayPartTester<unknown>(part, this.partTesters);
        const regex = { testMaybeRegex: this.regex.testMaybeRegex };
        return terms.some((term) => {
            if (term.when !== undefined && !testWhenConditions(term.when, play, regex)) {
                this.logger.debug(`When condition for ${part} term not met, will not use it`);
                return false;
            }
            return tester(term.search, play, regex);
        });
    }

    /** Parts with terms in this rule set */
    protected rulesUnitParts(unit: ActionStageRulesUnit): [ActionRulePart, SearchTerm<unknown>[]][] {
        return ACTION_RULE_PARTS
            .map((part) => [part, unit[part]] as [ActionRulePart, SearchTerm<unknown>[] | undefined])
            .filter((x): x is [ActionRulePart, SearchTerm<unknown>[]] => x[1] !== undefined && x[1].length > 0);
    }

    /** Every part with terms matches (AND). A rule set without terms does not match */
    protected testRulesUnit(play: PlayObject, unit: ActionStageRulesUnit): boolean {
        const parts = this.rulesUnitParts(unit);
        return parts.length > 0 && parts.every(([part, terms]) => this.testTerms(play, part, terms));
    }

    /** Stage terms are applied first, then terms from transformer `defaults` */
    protected doParseConfig(data: ActionStage): ActionStage {
        const defaults = actionRulesSchema.parse(this.config.defaults ?? {});
        const merged: ActionStage = {...data, matches: [...(data.matches ?? []), ...(defaults.matches ?? [])]};
        for (const part of ACTION_RULE_PARTS) {
            // ponytail: cast, every part is an array of terms but TS can't correlate the key with its term type
            (merged as unknown as Record<string, unknown[]>)[part] = [...(data[part] ?? []), ...(defaults[part] ?? [])];
        }
        return merged;
    }

    protected async doHandle(parts: ActionStage, play: PlayObject, transformData: string, opts?: OptionalCacheUsage): Promise<PlayObject> {
        const { matches = [], ...topLevel } = parts;

        // top-level rules and each `matches` rule set are OR'd together
        const matched = [topLevel, ...matches].some(unit => this.testRulesUnit(play, unit));
        const action: ActionType = matched ? parts.actionOnSuccess : parts.actionOnFailure;
        this.logger.debug(`Rules ${matched ? 'matched' : 'did not match'}, action: ${action}`);

        // TODO apply action to Play
        return play;
    }

    public async notify(payload: WebhookPayload): Promise<void> {
        return;
    }
}