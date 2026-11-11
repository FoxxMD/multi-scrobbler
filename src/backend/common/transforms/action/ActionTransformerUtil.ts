import * as z from 'zod';
import { buildRuleSchema, buildRulesSchema, buildStageSchema, maybeArraySchema, searchTermSchema } from "../../../../core/Transform.ts";

export const actionRulesUnitSchema = buildRulesSchema(maybeArraySchema(searchTermSchema)).extend({
    musicService: buildRuleSchema(maybeArraySchema(searchTermSchema), undefined, 'Match music service'),
    user: buildRuleSchema(maybeArraySchema(searchTermSchema), undefined, 'Match user'),
    library: buildRuleSchema(maybeArraySchema(searchTermSchema), undefined, 'Match library'),
    deviceId: buildRuleSchema(maybeArraySchema(searchTermSchema), undefined, 'Match device id'),
    playlist: buildRuleSchema(maybeArraySchema(searchTermSchema), undefined, 'Match playlist name/id'),
});

export type ActionStageRulesUnit = z.output<typeof actionRulesUnitSchema>

export const actionRulesSchema = actionRulesUnitSchema.extend({
    matches: z.array(actionRulesUnitSchema).optional().meta({description: 'A set of OR conditions to match'})
})

export type ActionStageRules = z.output<typeof actionRulesSchema>

export const actionType = z.enum(['approve','ignore','review']);

export type ActionType = z.infer<typeof actionType>;

export const actionStageSchema = buildStageSchema('action', actionRulesSchema, z.object({})).meta({title: 'Action Stage'}).extend({
    actionOnSuccess: actionType,
    actionOnFailure: actionType
});

export type ActionStage = z.output<typeof actionStageSchema>;