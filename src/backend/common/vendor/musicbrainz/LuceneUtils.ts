/** Field name => value(s) to search for. Keys are used verbatim as lucene field names, undefined values are ignored */
export type LuceneQuery = Record<string, string | string[] | undefined>;

export interface LuceneQueryOptions<T extends LuceneQuery> {
    /** Operator used between fields, defaults to AND */
    operator?: 'AND' | 'OR'
    /**
     * Fields that should prefer matching all of their values, with matching any value as fallback
     *
     * Multiple values for fields not listed here are matched with OR
     */
    preferAll?: (keyof T)[]
}

export interface LuceneCleanOptions {
    escapeCharacters?: boolean
    removeCharacters?: boolean
}

export const LUCENE_SPECIAL_CHARACTER_REGEX: string[] = ['\\','+','-','&&','||','!','(',')','{','}','[',']','^','"','~','*','?',':','/'];
/**
 * https://lucene.apache.org/core/7_7_2/queryparser/org/apache/lucene/queryparser/classic/package-summary.html#package.description
 * https://beta.musicbrainz.org/doc/MusicBrainz_API/Search
 * */
export const escapeLuceneSpecialChars = (str: string): string => {
    let cleaned = str;
    for(const char of LUCENE_SPECIAL_CHARACTER_REGEX) {
        cleaned = cleaned.replaceAll(char, `\\$&`);
    }
    return cleaned;
}

const NON_WORD_ADJACENT_BOUNDARY_REGEX: RegExp = new RegExp(/(?<=\w)[^a-zA-Z\d\s](?=\w)/g);
const NON_WORDWHITESPACE_REGEX: RegExp = new RegExp(/[^a-zA-Z\d\s]/g);
export const removeNonWordCharacters = (str: string): string => {
    // replace any non-alphanumeric, non-whitespace characters that are surrounded by non-whitespace characters
    // with a whitespace EX "My Cool-Fun Title" => "My Cool Fun Title"
    let cleaned = str.replaceAll(NON_WORD_ADJACENT_BOUNDARY_REGEX, ' ');

    // remove any non-alphanumeric, non-whitespace characters
    // with a whitespace EX "My Cool (Title)" => "My Cool Title"
    cleaned = cleaned.replaceAll(NON_WORDWHITESPACE_REGEX, '');
    return cleaned;
}

const fieldValues = (val: string | string[] | undefined): string[] => val === undefined ? [] : (Array.isArray(val) ? val : [val]);

/**
 * Returns a copy of the query with the values of the given fields escaped and/or stripped of non-word characters
 *
 * Only pass fields with free text values (names, titles). Identifiers like MBIDs should be left out so they are used verbatim
 */
export const cleanLuceneFields = <T extends LuceneQuery>(query: T, fields: (keyof T)[], options: LuceneCleanOptions = {}): T => {
    const {
        escapeCharacters = true,
        removeCharacters = false
    } = options;
    const clean = (str: string): string => {
        const cleaned = escapeCharacters ? escapeLuceneSpecialChars(str) : str;
        return removeCharacters ? removeNonWordCharacters(cleaned) : cleaned;
    }
    const cleaned: LuceneQuery = {...query};
    for(const field of fields as string[]) {
        const val = cleaned[field];
        if(val !== undefined) {
            cleaned[field] = Array.isArray(val) ? val.map(clean) : clean(val);
        }
    }
    return cleaned as T;
}

/** Builds a fielded lucene query string. Fields are output in the order they were added to the query object */
export const buildLuceneQuery = <T extends LuceneQuery>(query: T, options: LuceneQueryOptions<T> = {}): string => {
    const {
        operator = 'AND',
        preferAll = []
    } = options;
    const clauses: string[] = [];
    for(const [field, val] of Object.entries(query)) {
        const quoted = fieldValues(val).map(x => `"${x}"`);
        if(quoted.length === 0) {
            continue;
        }
        if(quoted.length === 1) {
            clauses.push(`${field}:${quoted[0]}`);
        } else if(preferAll.includes(field)) {
            clauses.push(`(${field}:(${quoted.join(' AND ')}) OR ${field}:(${quoted.join(' OR ')}))`);
        } else {
            clauses.push(`${field}:(${quoted.join(' OR ')})`);
        }
    }
    return clauses.join(` ${operator} `);
}

/** Builds a query string with no field names, using only the values of the given fields in the order given */
export const buildFreetextQuery = <T extends LuceneQuery>(query: T, fields: (keyof T)[]): string => fields.flatMap(x => fieldValues(query[x])).join(' ');
