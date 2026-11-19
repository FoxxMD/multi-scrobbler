/**
 * Inclusive time ranges in milliseconds. Used for mirror coverage (which time spans of an upstream account are completely mirrored).
 *
 * All ranges are inclusive on both ends, and two ranges are merged when they overlap or touch (a.to + 1 === b.from).
 */
export type TimeRange = [number, number];

/** Sort ascending and merge overlapping/adjacent ranges */
export const mergeRanges = (ranges: TimeRange[]): TimeRange[] => {
    const sorted = ranges.filter(([from, to]) => from <= to).sort((a, b) => a[0] - b[0]);
    const merged: TimeRange[] = [];
    for (const [from, to] of sorted) {
        const last = merged[merged.length - 1];
        if (last !== undefined && from <= last[1] + 1) {
            last[1] = Math.max(last[1], to);
        } else {
            merged.push([from, to]);
        }
    }
    return merged;
}

export const addRange = (ranges: TimeRange[], range: TimeRange): TimeRange[] => mergeRanges([...ranges, range]);

/** Parts of `range` not covered by `remove` */
const subtractOne = (range: TimeRange, remove: TimeRange): TimeRange[] => {
    const [from, to] = range;
    const [rFrom, rTo] = remove;
    if (rTo < from || rFrom > to) {
        return [range];
    }
    const parts: TimeRange[] = [];
    if (rFrom > from) {
        parts.push([from, rFrom - 1]);
    }
    if (rTo < to) {
        parts.push([rTo + 1, to]);
    }
    return parts;
}

/** Remove `range` from every range in `ranges` (IE delete a time span from coverage) */
export const removeRange = (ranges: TimeRange[], range: TimeRange): TimeRange[] => mergeRanges(ranges.flatMap(x => subtractOne(x, range)));

/** Gaps: the parts of `requested` that are not in `covered`, sorted ascending */
export const subtractRanges = (requested: TimeRange, covered: TimeRange[]): TimeRange[] => {
    let gaps: TimeRange[] = [requested];
    for (const c of covered) {
        gaps = gaps.flatMap(x => subtractOne(x, c));
    }
    return mergeRanges(gaps);
}

/**
 * The contiguous covered span that starts at `edge` and extends in `direction`.
 *
 * * desc => [start of the covered range containing edge, edge]
 * * asc  => [edge, end of the covered range containing edge]
 *
 * Returns undefined if edge is not covered.
 */
export const contiguousCoveredFrom = (edge: number, direction: 'asc' | 'desc', covered: TimeRange[]): TimeRange | undefined => {
    const containing = mergeRanges(covered).find(([from, to]) => from <= edge && edge <= to);
    if (containing === undefined) {
        return undefined;
    }
    return direction === 'desc' ? [containing[0], edge] : [edge, containing[1]];
}
