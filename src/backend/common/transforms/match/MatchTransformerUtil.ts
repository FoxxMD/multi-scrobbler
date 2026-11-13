import * as z from 'zod';
import { buildRuleSchema, buildRulesSchema, buildSearchTermSchema, buildStageSchema, maybeArraySchema, searchTermSchema } from "../../../../core/Transform.ts";
import { durationComparisonSchema } from "../../../../core/TimeUtils.ts";

// meta is not testable by Match Stages (no tester)
export const matchRulesUnitSchema = buildRulesSchema(maybeArraySchema(searchTermSchema)).omit({meta: true}).extend({
    duration: buildRuleSchema(maybeArraySchema(buildSearchTermSchema(durationComparisonSchema, 'Duration Term')), undefined, 'Match Play duration EX > 7 s'),
    listenedFor: buildRuleSchema(maybeArraySchema(buildSearchTermSchema(durationComparisonSchema, 'Listened For Term')), undefined, 'Match listened for duration EX > 7 s'),
    musicService: buildRuleSchema(maybeArraySchema(searchTermSchema), undefined, 'Match music service'),
    user: buildRuleSchema(maybeArraySchema(searchTermSchema), undefined, 'Match user'),
    library: buildRuleSchema(maybeArraySchema(searchTermSchema), undefined, 'Match library'),
    deviceId: buildRuleSchema(maybeArraySchema(searchTermSchema), undefined, 'Match device id'),
    playlist: buildRuleSchema(maybeArraySchema(searchTermSchema), undefined, 'Match playlist name/id'),
});

export type MatchStageRulesUnit = z.output<typeof matchRulesUnitSchema>

export const matchRulesSchema = matchRulesUnitSchema.extend({
    matches: z.array(matchRulesUnitSchema).optional().meta({description: 'A set of OR conditions to match'})
})

export type MatchStageRules = z.output<typeof matchRulesSchema>

export const matchStageSchema = buildStageSchema('match', matchRulesSchema, z.object({})).meta({title: 'Match Stage'});

export type MatchStage = z.output<typeof matchStageSchema>;