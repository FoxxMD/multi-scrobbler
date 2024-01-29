import {Logger} from "@foxxmd/winston";
import AvahiBrowser from 'avahi-browse';
import { MaybeLogger } from "../common/logging.js";
import { sleep } from "../utils.js";
import {ErrorWithCause} from "pony-cause";
import { MdnsDeviceInfo } from "../common/infrastructure/Atomic.js";
import {Browser, Service, ServiceType} from "@astronautlabs/mdns";
import {debounce, DebouncedFunction} from "./debounce.js";

export interface AvahiService {
    service_name: string
    target: {
        service_type: string
        domain: string
        host: string
        hostname: string
        port: string
    }
}

export interface DiscoveryOptions<T> {
    sanity?: boolean
    onDiscover?: (service: MdnsDeviceInfo) => void
    onDnsError?: (err: Error) => void
    duration?: number,
    logger?: Logger
}

export const discoveryAvahi = async (service: string, options?: DiscoveryOptions<AvahiService>) => {
    const {
        logger,
        duration = 10000,
        sanity = false,
        onDiscover,
        onDnsError
    } = options;

    const maybeLogger = new MaybeLogger(logger, 'Avahi mDNS');
    maybeLogger.debug(`Starting mDNS discovery with Avahi => Listening for ${(duration / 1000).toFixed(2)}s`);
    let anyDiscovered = false;

    let services = new Map<string, MdnsDeviceInfo>();

    const triggerDiscovery = () => {
        for(const [k,v] of services.entries()) {
            maybeLogger.debug(`Discovered device "${v.name}" with ${v.addresses.length} interfaces`);
            onDiscover(v);
            services.delete(k);
        }
    }

    let debouncedFunc: DebouncedFunction;

    try {
        const browser = new AvahiBrowser(service);
        browser.on(AvahiBrowser.EVENT_SERVICE_UP, async (service: AvahiService) => {
            anyDiscovered = true;

            if(onDiscover !== undefined) {

                let foundService = services.get(service.service_name);
                if(foundService === undefined) {
                    foundService = {
                        name: service.service_name,
                        addresses: [service.target.host],
                        type: service.target.service_type,
                    }
                } else {
                    foundService.addresses.push(service.target.host);
                }
                services.set(foundService.name, foundService);

                if(debouncedFunc === undefined) {
                    debouncedFunc = debounce(() => triggerDiscovery(), 1000);
                } else {
                    await debouncedFunc();
                }
            }
        });
        browser.on(AvahiBrowser.EVENT_DNSSD_ERROR, (err) => {
            const e = new ErrorWithCause('Error occurred while using avahi-browse', {cause: err});
            if (onDnsError) {
                onDnsError(e)
            } else {
                maybeLogger.error(e);
            }
        });
        browser.start();
        if (sanity) {
            await sleep(1500);
            if (!anyDiscovered) {
                maybeLogger.debug('Did not find any mdns services after 1.5s! Do you have port 5353 open?');
            }
            await sleep(duration - 1500);
        } else {
            await sleep(duration);
        }
        maybeLogger.debug('Stopped discovery');
    } catch (e) {
        maybeLogger.warn(new ErrorWithCause('mDNS device discovery with avahi-browse failed', {cause: e}));
    }
}

export const discoveryNative = async (service: string, options?: DiscoveryOptions<Service>) => {
    const {
        logger,
        duration = 10000,
        sanity = false,
        onDiscover,
        onDnsError
    } = options;

    const maybeLogger = new MaybeLogger(logger, 'mDNS');
    maybeLogger.debug(`Starting mDNS discovery => Listening for ${(duration / 1000).toFixed(2)}s`);

    if (sanity) {
        let services: ServiceType[] = [];
        const testBrowser = new Browser(ServiceType.all())
            .on('serviceUp', (service: ServiceType) => {
                services.push(service)
            })
            .start();
        testBrowser.on('error', (err) => {
            maybeLogger.error(new ErrorWithCause('Error occurred during mDNS service discovery', {cause: err}));
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
        const e = new ErrorWithCause('Error occurred during mDNS discovery', {cause: err});
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
