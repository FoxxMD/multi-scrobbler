import { Browser, type Service, ServiceType } from "@astronautlabs/mdns";
import type {Logger} from "@foxxmd/logging";
import type {MdnsDeviceInfo} from "../common/infrastructure/Atomic.ts";
import { MaybeLogger } from '../common/MaybeLogger.ts';
import { sleep } from "../utils.ts";

export interface DiscoveryOptions<T> {
    sanity?: boolean
    onDiscover?: (service: MdnsDeviceInfo) => void
    onDnsError?: (err: Error) => void
    duration?: number,
    logger?: Logger
}

export const discoveryNative = async (service: string, options?: DiscoveryOptions<Service>) => {
    const {
        logger,
        duration = 10000,
        sanity = false,
        onDiscover,
        onDnsError
    } = options ?? {};

    const maybeLogger = new MaybeLogger(logger, 'mDNS');
    maybeLogger.debug(`Starting mDNS discovery => Listening for ${(duration / 1000).toFixed(2)}s`);

    if (sanity) {
        const services: ServiceType[] = [];
        const testBrowser = new Browser(ServiceType.all())
            .on('serviceUp', (service: ServiceType) => {
                services.push(service)
            })
            .start();
        testBrowser.on('error', (err) => {
            maybeLogger.error(new Error('Error occurred during mDNS service discovery', {cause: err}));
        });
        maybeLogger.debug('Waiting 1s to gather advertised mdns services...');
        await sleep(1000);
        testBrowser.stop();
        if (services.length === 0) {
            maybeLogger.debug('Did not find any mdns services! Do you have port 5353 open?');
        } else {
            maybeLogger.debug(`Found services: ${services.map(x => `${x.name}-${x.protocol}`).join(' ,')}`);
        }
    }

    const browser = new Browser(service, {resolve: true})
        .on('serviceUp', async (service) => {
            maybeLogger.debug(`Discovered device "${service.name}" with ${service.addresses.length} interfaces`);
            if (onDiscover) {
                onDiscover({name: service.name, addresses: service.addresses, type: service.service_type});
            }
        })
    browser.on('error', (err) => {
        const e = new Error('Error occurred during mDNS discovery', {cause: err});
        if (onDnsError) {
            onDnsError(e)
        } else {
            maybeLogger.error(e);
        }
    });
    browser.start();
    await sleep(duration);
    maybeLogger.debug('Stopped discovery');
    browser.stop();
}
