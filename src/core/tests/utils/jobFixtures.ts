import { faker } from "@faker-js/faker";
import dayjs from "dayjs";
import type { JobApiJson, JobOptionsApiJson, JobTargetApiJson, MirrorApiJson } from "../../Job.ts";

const DAY = 24 * 60 * 60 * 1000;

export const generateMirrorApiJson = (data: Partial<MirrorApiJson> = {}): MirrorApiJson => {
    const id = data.id ?? faker.number.int({min: 1, max: 100});
    const account = faker.internet.username();
    const end = dayjs().subtract(faker.number.int({min: 1, max: 30}), 'day').valueOf();
    const start = end - faker.number.int({min: 365, max: 3650}) * DAY;
    return {
        id,
        name: `Last.fm ${account}`,
        service: 'mixed',
        account: null,
        locked: false,
        coverage: [[start, end]],
        segments: [{range: [start, end], origin: 'lastfm', jobId: 1}],
        gaps: [],
        plays: faker.number.int({min: 1000, max: 150000}),
        jobs: [{id: 1, name: 'Last.fm import'}],
        task: null,
        createdAt: dayjs(end).toISOString(),
        updatedAt: dayjs(end).toISOString(),
        ...data,
    };
}

export const generateJobTargetApiJson = (data: Partial<JobTargetApiJson> = {}): JobTargetApiJson => {
    const exported = data.exported ?? faker.number.int({min: 100, max: 5000});
    const queued = data.queued ?? exported - faker.number.int({min: 0, max: 50});
    const startedAt = dayjs().subtract(faker.number.int({min: 1, max: 48}), 'hour');
    return {
        id: faker.number.int({min: 1, max: 1000}),
        componentId: faker.number.int({min: 1, max: 20}),
        name: faker.word.noun(),
        type: 'maloja',
        status: 'running',
        cursor: {playedAt: dayjs().subtract(faker.number.int({min: 30, max: 900}), 'day').valueOf(), id: faker.number.int({min: 1, max: 10000})},
        exported,
        queued,
        records: queued,
        stats: {scrobbled: Math.floor(queued * 0.9), duped: Math.floor(queued * 0.08), queued: queued - Math.floor(queued * 0.9) - Math.floor(queued * 0.08)},
        error: null,
        breaker: {failedInARow: 0},
        startedAt: startedAt.toISOString(),
        completedAt: null,
        updatedAt: dayjs().toISOString(),
        ...data,
    };
}

/** An import from a Last.fm Source with no export targets, unless given */
export const generateJobApiJson = (data: Partial<JobApiJson> = {}): JobApiJson => {
    const mirror = data.mirror ?? (() => {
        const m = generateMirrorApiJson();
        return {id: m.id, name: m.name, service: m.service, account: m.account};
    })();
    const importTotal = data.importTotal !== undefined ? data.importTotal : faker.number.int({min: 5000, max: 100000});
    const importFetched = data.importFetched ?? Math.floor((importTotal ?? 10000) * faker.number.float({min: 0.1, max: 0.9}));
    const createdAt = dayjs().subtract(faker.number.int({min: 1, max: 10}), 'day');
    const targets = data.targets ?? [];
    return {
        id: faker.number.int({min: 1, max: 1000}),
        name: 'Last.fm import',
        status: 'running',
        mirror,
        importFrom: {kind: 'component', componentId: 1, name: 'My Last.fm'},
        rangeFrom: null,
        rangeTo: createdAt.toISOString(),
        persistInputs: true,
        importOverlap: 'skip',
        importReplacedAt: null,
        transformOptions: null,
        transformSource: null,
        exportOrder: 'asc',
        exportQueueLimit: 20,
        targets,
        mirrorPlaysInRange: importFetched,
        importStatus: 'running',
        importCursor: {to: dayjs().subtract(faker.number.int({min: 100, max: 2000}), 'day').valueOf()},
        importTotal,
        importFetched,
        imported: importFetched - faker.number.int({min: 0, max: Math.min(500, importFetched)}),
        importError: null,
        importStartedAt: createdAt.toISOString(),
        importCompletedAt: null,
        createdAt: createdAt.toISOString(),
        updatedAt: dayjs().toISOString(),
        runtime: {import: {}, exports: {}},
        ...data,
    };
}

export const generateJobOptionsApiJson = (data: Partial<JobOptionsApiJson> = {}): JobOptionsApiJson => {
    const end = dayjs().subtract(3, 'day').valueOf();
    return {
        importComponents: [
            {componentId: 1, name: 'My Last.fm', mode: 'source', ready: true, account: 'listener'},
            {componentId: 2, name: 'Last.fm Scrobbler', mode: 'client', ready: true, account: 'listener'},
        ],
        mirrors: [{id: 1, name: 'Last.fm listener', service: 'mixed', account: null, locked: false, coverage: [[end - 2000 * DAY, end]], playCount: 84321}],
        importFiles: [{name: 'scrobbles-listener.json', size: 24 * 1024 * 1024, modifiedAt: dayjs().subtract(2, 'day').toISOString()}],
        targets: [
            {componentId: 3, name: 'Maloja', type: 'maloja', ready: true, rejectsOldScrobbles: false},
            {componentId: 4, name: 'Koito', type: 'koito', ready: true, rejectsOldScrobbles: false},
            {componentId: 2, name: 'Last.fm Scrobbler', type: 'lastfm', ready: true, rejectsOldScrobbles: true},
        ],
        presets: [{name: 'clean-titles', stages: [{type: 'user', title: [{search: '(Remastered)', replace: ''}]}]}],
        componentTransforms: [],
        ...data,
    };
}
