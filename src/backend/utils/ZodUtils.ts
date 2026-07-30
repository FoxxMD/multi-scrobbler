import z from 'zod';

export interface TableColumn {
    title: string
    required: boolean
    type: string
    default: unknown
    description: string | undefined
}

export type PipeUnwrapDirection = 'in' | 'out';

const unwrapZodType = (schema: z.ZodTypeAny, pipeDirection: PipeUnwrapDirection = 'in'): z.ZodTypeAny => {
    let current = schema;
    while (current instanceof z.ZodOptional || current instanceof z.ZodNullable || current instanceof z.ZodDefault || current instanceof z.ZodPipe) {
        current = (current instanceof z.ZodPipe ? current[pipeDirection] : current.unwrap()) as z.ZodTypeAny;
    }
    return current;
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
            type: unwrapZodType(fieldSchema, pipeDirection).def.type,
            default: getExplicitDefault(fieldSchema) ?? (meta?.default as unknown),
            description: meta?.description as string | undefined
        };
    });