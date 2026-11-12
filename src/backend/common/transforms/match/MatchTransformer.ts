import type { PlayObject, OptionalCacheUsage } from "../../../../core/Atomic.ts";
import type { SearchTerm } from "../../../../core/Transform.ts"
import { getPlayPartTester, type SuppliedPlayPartTesters, testWhenConditions } from "../../../utils/PlayTransformUtils.ts";
import { StagePrerequisiteError } from "../../errors/MSErrors.ts";
import type { WebhookPayload } from "../../infrastructure/config/health/webhooks.ts";
import AbstractTransformer from "../AbstractTransformer.ts"
import { matchRulesSchema, matchRulesUnitSchema, matchStageSchema, type MatchStage, type MatchStageRulesUnit } from "./MatchTransformerUtil.ts"

const MATCH_RULE_PARTS = matchRulesUnitSchema.keyof().options;
type MatchRulePart = typeof MATCH_RULE_PARTS[number];

/** Parsed test value (`search` of each term) for each Action rule part */
type MatchPartTests = { [K in MatchRulePart]: NonNullable<MatchStageRulesUnit[K]> extends SearchTerm<infer T>[] ? T : never };

export default class MatchTransformer extends AbstractTransformer<string, MatchStage> {

    protected readonly stageSchema = matchStageSchema;

    /** Testers for Action rule parts without a built-in tester, or to override them */
    protected readonly partTesters: SuppliedPlayPartTesters<MatchPartTests> = {};

    /** Any term matches (OR). A term with a `when` is only tested if its `when` matches */
    protected testTerms(play: PlayObject, part: MatchRulePart, terms: SearchTerm<unknown>[]): boolean {
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
    protected rulesUnitParts(unit: MatchStageRulesUnit): [MatchRulePart, SearchTerm<unknown>[]][] {
        return MATCH_RULE_PARTS
            .map((part) => [part, unit[part]] as [MatchRulePart, SearchTerm<unknown>[] | undefined])
            .filter((x): x is [MatchRulePart, SearchTerm<unknown>[]] => x[1] !== undefined && x[1].length > 0);
    }

    /** Every part with terms matches (AND). A rule set without terms does not match */
    protected testRulesUnit(play: PlayObject, unit: MatchStageRulesUnit): boolean {
        const parts = this.rulesUnitParts(unit);
        return parts.length > 0 && parts.every(([part, terms]) => this.testTerms(play, part, terms));
    }

    /** Stage terms are applied first, then terms from transformer `defaults` */
    protected doParseConfig(data: MatchStage): MatchStage {
        const defaults = matchRulesSchema.parse(this.config.defaults ?? {});
        const merged: MatchStage = {...data, matches: [...(data.matches ?? []), ...(defaults.matches ?? [])]};
        for (const part of MATCH_RULE_PARTS) {
            // ponytail: cast, every part is an array of terms but TS can't correlate the key with its term type
            (merged as unknown as Record<string, unknown[]>)[part] = [...(data[part] ?? []), ...(defaults[part] ?? [])];
        }
        return merged;
    }

    protected async doHandle(parts: MatchStage, play: PlayObject, transformData: string, opts?: OptionalCacheUsage): Promise<PlayObject> {
        const { matches = [], ...topLevel } = parts;

        // top-level rules and each `matches` rule set are OR'd together
        const matched = [topLevel, ...matches].some(unit => this.testRulesUnit(play, unit));
        if(matched === false) {
            throw new StagePrerequisiteError('No rules matched this Play');
        }
        return play;
    }

    public async notify(payload: WebhookPayload): Promise<void> {
        return;
    }
}