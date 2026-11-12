import * as z from 'zod';
import { buildRuleSchema, buildRulesSchema, buildSearchTermSchema, buildStageSchema, maybeArraySchema, searchTermSchema } from "../../../../core/Transform.ts";
import { durationComparisonSchema } from "../../../../core/TimeUtils.ts";

// meta is not testable by Action Stages (no tester)
export const matchRulesUnitSchema = buildRulesSchema(maybeArraySchema(searchTermSchema)).omit({meta: true}).extend({
    duration: buildRuleSchema(maybeArraySchema(buildSearchTermSchema(durationComparisonSchema, 'Duration Term')), undefined, 'Match Play duration EX > 7 s'),
    listenedFor: buildRuleSchema(maybeArraySchema(buildSearchTermSchema(durationComparisonSchema, 'Listened For Term')), undefined, 'Match listened for duration EX > 7 s'),
    musicService: buildRuleSchema(maybeArraySchema(searchTermSchema), undefined, 'Match music service'),
    user: buildRuleSchema(maybeArraySchema(searchTermSchema), undefined, 'Match user'),
    library: buildRuleSchema(maybeArraySchema(searchTermSchema), undefined, 'Match library'),
    deviceId: buildRuleSchema(maybeArraySchema(searchTermSchema), undefined, 'Match device id'),
    playlist: buildRuleSchema(maybeArraySchema(searchTermSchema), undefined, 'Match playlist name/id'),
});

export type ActionStageRulesUnit = z.output<typeof matchRulesUnitSchema>

export const matchRulesSchema = matchRulesUnitSchema.extend({
    matches: z.array(matchRulesUnitSchema).optional().meta({description: 'A set of OR conditions to match'})
})

export type MatchStageRules = z.output<typeof matchRulesSchema>

export const actionType = z.enum(['approve','ignore','review']);

export type ActionType = z.infer<typeof actionType>;

export const actionStageSchema = buildStageSchema('action', matchRulesSchema, z.object({})).meta({title: 'Action Stage'}).extend({
    actionOnSuccess: actionType,
    actionOnFailure: actionType
});

export type ActionStage = z.output<typeof actionStageSchema>;