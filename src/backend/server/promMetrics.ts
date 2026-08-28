import type { DrizzlePlayHistoricalRepository } from "../common/database/drizzle/repositories/PlayHistoricalRepository.ts";
import type { DrizzlePlayRepository } from "../common/database/drizzle/repositories/PlayRepository.ts";
import prom from 'prom-client';
import type ScrobbleSources from "../sources/ScrobbleSources.ts";
import type ScrobbleClients from "../scrobblers/ScrobbleClients.ts";
import { PLAY_CLIENT_STATE, PLAY_SOURCE_STATE } from "../../core/Atomic.ts";
import AbstractHistoricalScrobbleClient from "../scrobblers/AbstractHistoricalScrobbleClient.ts";

let playRepo: DrizzlePlayRepository,
    playHistoricalRepo: DrizzlePlayHistoricalRepository;

export const setMetricRepositories = (play: DrizzlePlayRepository, playHistorical: DrizzlePlayHistoricalRepository) => {
    playRepo = play;
    playHistoricalRepo = playHistorical;
}
export const hasMetricRepositories = () => playRepo !== undefined;

export const registerMetrics = (scrobbleSources: ScrobbleSources, scrobbleClients: ScrobbleClients) => {
    if (prom.register.getSingleMetric('multiscrobbler_client_issues') === undefined) {
        new prom.Gauge({
            name: 'multiscrobbler_client_issues',
            help: 'Number of errors/issues with Client',
            labelNames: ['name', 'type'],
            async collect() {
                for (const client of scrobbleClients.clients) {
                    let issues = 0;
                    if (!(await client.isReady())) {
                        issues++;
                    }
                    this.labels({ name: client.getSafeExternalName(), type: client.type }).set(issues);
                }
            }
        });
    }
    if (prom.register.getSingleMetric('multiscrobbler_source_issues') === undefined) {
        new prom.Gauge({
            name: 'multiscrobbler_source_issues',
            help: 'Number of errors/issues with Source',
            labelNames: ['name', 'type'],
            async collect() {
                for (const source of scrobbleSources.sources) {
                    let issues = 0;
                    if (source.requiresAuth && !source.authed) {
                        issues++;
                    }
                    if (source.canPoll && !source.polling) {
                        issues++;
                    }
                    this.labels({ name: source.getSafeExternalName(), type: source.type }).set(issues);
                }
            }
        });
    }
    if (prom.register.getSingleMetric('multiscrobbler_source_plays') === undefined) {
        new prom.Gauge({
            name: 'multiscrobbler_source_plays',
            help: 'Count of stored plays by state for Sources',
            labelNames: ['name', 'type', 'state'],
            async collect() {
                const res = await playRepo.getPlayCountByState();
                for (const source of scrobbleSources.sources) {
                    const relevant = res.filter(x => x['componentId'] === source.componentId);
                    for (const s of PLAY_SOURCE_STATE) {
                        const rel = relevant.find(x => x['state'] === s);
                        const count = rel === undefined ? 0 : rel['count(*)'];
                        this.labels({ name: source.getSafeExternalName(), type: source.type, state: s }).set(count);
                    }
                }
            }
        });
    }

    if (prom.register.getSingleMetric('multiscrobbler_source_plays_compacted') === undefined) {
        new prom.Gauge({
            name: 'multiscrobbler_source_plays_compacted',
            help: 'Count of compacted, stored plays by compaction type for Sources',
            labelNames: ['name', 'type', 'compactionType'],
            async collect() {
                const res = await playRepo.getCompactedPlayCountByComponent();
                for (const source of scrobbleSources.sources) {
                    const relevant = res.filter(x => x['componentId'] === source.componentId);
                    for (const s of ['input', 'transform', 'input-transform']) {
                        const rel = relevant.find(x => x['compacted'] === s);
                        const count = rel === undefined ? 0 : rel['count(*)'];
                        this.labels({ name: source.getSafeExternalName(), type: source.type, compactionType: s }).set(count);
                    }
                }
            }
        });
    }
    if (prom.register.getSingleMetric('multiscrobbler_client_plays') === undefined) {
        new prom.Gauge({
            name: 'multiscrobbler_client_plays',
            help: 'Count of stored plays by state for Clients',
            labelNames: ['name', 'type', 'state'],
            async collect() {
                const res = await playRepo.getPlayCountByState();
                for (const client of scrobbleClients.clients) {
                    const relevant = res.filter(x => x['componentId'] === client.componentId);
                    for (const s of PLAY_CLIENT_STATE) {
                        const rel = relevant.find(x => x['state'] === s);
                        const count = rel === undefined ? 0 : rel['count(*)'];
                        this.labels({ name: client.getSafeExternalName(), type: client.type, state: s }).set(count);
                    }
                }
            }
        });
    }
    if (prom.register.getSingleMetric('multiscrobbler_client_plays_compacted') === undefined) {
        new prom.Gauge({
            name: 'multiscrobbler_client_plays_compacted',
            help: 'Count of compacted, stored plays by compaction type for Clients',
            labelNames: ['name', 'type', 'compactionType'],
            async collect() {
                const res = await playRepo.getCompactedPlayCountByComponent();
                for (const client of scrobbleClients.clients) {
                    const relevant = res.filter(x => x['componentId'] === client.componentId);
                    for (const s of ['input', 'transform', 'input-transform']) {
                        const rel = relevant.find(x => x['compacted'] === s);
                        const count = rel === undefined ? 0 : rel['count(*)'];
                        this.labels({ name: client.getSafeExternalName(), type: client.type, compactionType: s }).set(count);
                    }
                }
            }
        });
    }
    if (prom.register.getSingleMetric('multiscrobbler_client_historical_plays') === undefined) {
        new prom.Gauge({
            name: 'multiscrobbler_client_historical_plays',
            help: 'Count of stored historical plays for Clients',
            labelNames: ['name', 'type'],
            async collect() {
                const res = await playHistoricalRepo.getPlayCountByComponent();
                for (const client of scrobbleClients.clients) {
                    if (client instanceof AbstractHistoricalScrobbleClient) {
                        const relevant = res.filter(x => x['componentId'] === client.componentId);
                        for (const rel of relevant) {
                            this.labels({ name: client.getSafeExternalName(), type: client.type }).set(rel['count(*)']);
                        }
                    }
                }
            }
        });
    }
}