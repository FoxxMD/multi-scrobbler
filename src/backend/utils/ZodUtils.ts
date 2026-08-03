import z from 'zod';
import { commaSeparatedListReplace, parseArrayFromMaybeString, parseBoolOrArrayFromMaybeString } from './StringUtils.ts';

export interface TableColumn {
    title: string
    required: boolean
    type: string | string[]
    default: unknown
    description: string | undefined
}

export type PipeUnwrapDirection = 'in' | 'out';

const otherPipeDirection: Record<PipeUnwrapDirection, PipeUnwrapDirection> = { in: 'out', out: 'in' };

const unwrapWrappers = (schema: z.ZodTypeAny, pipeDirection: PipeUnwrapDirection): z.ZodTypeAny => {
    let current = schema;
    while (current instanceof z.ZodOptional || current instanceof z.ZodNullable || current instanceof z.ZodDefault || current instanceof z.ZodPipe) {
        if (current instanceof z.ZodPipe) {
            const side = current[pipeDirection];
            // ZodTransform carries no schema of its own, so its side of the pipe can't tell us
            // anything about the resulting shape -- fall back to the other side of the pipe.
            current = (side instanceof z.ZodTransform ? current[otherPipeDirection[pipeDirection]] : side) as z.ZodTypeAny;
        } else {
            current = current.unwrap() as z.ZodTypeAny;
        }
    }
    return current;
};

const literalValues = (schema: z.ZodLiteral): string[] => schema.def.values.map(String);

/**
 * Describes the final, meaningful type(s) accepted by a schema, unwrapping any
 * optional/nullable/default/pipe wrappers first.
 *
 * ZodLiteral and ZodEnum resolve to their actual allowed value(s) rather than their
 * type name, since "literal"/"enum" tell an end user nothing about what to enter.
 * ZodUnion resolves to the flattened, deduped description of all its members. Any
 * other type (object, array, promise, string, number, etc) is left as its type name --
 * it's not broken down any further.
 */
const describeType = (schema: z.ZodTypeAny, pipeDirection: PipeUnwrapDirection): string | string[] => {
    const core = unwrapWrappers(schema, pipeDirection);
    if (core instanceof z.ZodLiteral) {
        return literalValues(core);
    }
    if (core instanceof z.ZodEnum) {
        return Object.values(core.def.entries).map(String);
    }
    if (core instanceof z.ZodUnion) {
        return [...new Set(core.options.flatMap((opt) => describeType(opt as z.ZodTypeAny, pipeDirection)))];
    }
    return core.def.type;
};

const unwrapZodType = (schema: z.ZodTypeAny, pipeDirection: PipeUnwrapDirection = 'in'): string | string[] => {
    const described = describeType(schema, pipeDirection);
    return Array.isArray(described) && described.length === 1 ? described[0] : described;
};

const getExplicitDefault = (schema: z.ZodTypeAny): unknown => {
    let current = schema;
    while (true) {
        if (current instanceof z.ZodDefault) {
            return current.def.defaultValue;
        }
        if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
            current = current.unwrap() as z.ZodTypeAny;
            continue;
        }
        return undefined;
    }
};

/**
 * Takes a z.object and returns objects that can be used to build table rows for docs
 * 
 *  Based loosely on matejchalk/zod2md
 * */
export const zodObjectToTableColumns = <Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>, pipeDirection: PipeUnwrapDirection = 'in'): TableColumn[] =>
    Object.entries(schema.shape).map(([key, value]) => {
        const fieldSchema = value as z.ZodTypeAny;
        const meta = fieldSchema.meta() as Record<string, unknown> | undefined;

        return {
            title: (meta?.title as string | undefined) ?? key,
            required: !fieldSchema.isOptional(),
            type: unwrapZodType(fieldSchema, pipeDirection),
            default: getExplicitDefault(fieldSchema) ?? (meta?.default as unknown),
            description: meta?.description as string | undefined
        };
});

export const transformSplitMaybeString = z.transform((val: string) => val === undefined ? undefined : parseArrayFromMaybeString(val));
export const transformSplitMaybeStringOrBoolean = z.transform((val: string | true) => val === undefined ? undefined : parseBoolOrArrayFromMaybeString(val));

export const envMetaNormalize = (meta: z.GlobalMeta): z.GlobalMeta => {
    if(meta.description !== undefined) {
        return {
            ...meta,
            description: commaSeparatedListReplace(meta.description)
        }
    }
}