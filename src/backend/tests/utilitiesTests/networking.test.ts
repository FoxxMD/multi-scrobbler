import { assert, expect } from 'chai';
import { describe, it } from 'mocha';
import { generateBaseURL, joinedUrl, normalizeWebAddress } from "../../utils/NetworkUtils.js";


describe('URL Parsing', function () {
    describe('Base URL', function () {

       it('should return http://localhost:9078 if no url is specified', function () {
           assert.equal(generateBaseURL(undefined, 9078).toString(), 'http://localhost:9078/');
       });

        it('should normalize URL without protocol to HTTP', function () {
            assert.include(generateBaseURL('192.168.0.1', 9078).toString(), 'http://192.168.0.1');
            assert.include(generateBaseURL('my.domain.local', 9078).toString(), 'http://my.domain.local');
        });

        it('should use 443 for port, instead of default port, if protocol is https and no port is specified', function () {
            assert.include(generateBaseURL('https://192.168.0.1', 9078).toString(), 'https://192.168.0.1');
            assert.include(generateBaseURL('https://my.domain.local', 9078).toString(), 'https://my.domain.local');
        });

        it('should preserve port if explicitly specified', function () {
            assert.include(generateBaseURL('http://my.domain.local:80', 9078).toString(), 'http://my.domain.local');
            assert.include(generateBaseURL('192.168.0.1:80', 9078).toString(), 'http://192.168.0.1');
            assert.include(generateBaseURL('192.168.0.1:8000', 9078).toString(), 'http://192.168.0.1:8000');
            assert.include(generateBaseURL('my.domain.local:9075', 9078).toString(), 'http://my.domain.local:9075');
            assert.include(generateBaseURL('https://my.domain.local:9075', 9078).toString(), 'https://my.domain.local:9075');
        });

        it('should use default port if protocol is HTTP and port is not specified', function () {
            assert.include(generateBaseURL('192.168.0.1', 9078).toString(), 'http://192.168.0.1:9078');
            assert.include(generateBaseURL('http://my.domain.local', 9078).toString(), 'http://my.domain.local:9078');
        });

        it('should preserve pathname for subfolder usage', function () {
            assert.include(generateBaseURL('192.168.0.1/my/subfolder', 9078).toString(), 'http://192.168.0.1:9078/my/subfolder');
            assert.include(generateBaseURL('http://my.domain.local/my/subfolder', 9078).toString(), 'http://my.domain.local:9078/my/subfolder');
            assert.include(generateBaseURL('http://my.domain.local:5000/my/subfolder', 9078).toString(), 'http://my.domain.local:5000/my/subfolder');
            assert.include(generateBaseURL('https://my.domain.local/my/subfolder', 9078).toString(), 'https://my.domain.local/my/subfolder');
        });

        it('should should strip wrapping quotes', function () {
            assert.equal(generateBaseURL(`"http://192.168.3.120:9078"`, 9078).toString(), 'http://192.168.3.120:9078/');
        });
    });

    describe('URL Path Joining', function() {
       it('should join a path to a base URL without erasing base pathname', function() {
           const baseUrl = generateBaseURL('192.168.0.1/my/subfolder', 9078);
           assert.equal(joinedUrl(baseUrl, 'lastfm/callback').toString(), 'http://192.168.0.1:9078/my/subfolder/lastfm/callback');
       });
        it('should join a path to a base URL while handling leading and trailing slashes', function() {
            const baseUrl = generateBaseURL('192.168.0.1/my/subfolder', 9078);
            assert.equal(joinedUrl(baseUrl, '/lastfm/callback').toString(), 'http://192.168.0.1:9078/my/subfolder/lastfm/callback');
            assert.equal(joinedUrl(baseUrl, 'lastfm/callback/').toString(), 'http://192.168.0.1:9078/my/subfolder/lastfm/callback/');

            const baseUrlNoSub = generateBaseURL('192.168.0.1', 9078);
            assert.equal(joinedUrl(baseUrlNoSub, '/lastfm/callback').toString(), 'http://192.168.0.1:9078/lastfm/callback');
            assert.equal(joinedUrl(baseUrlNoSub, 'lastfm/callback/').toString(), 'http://192.168.0.1:9078/lastfm/callback/');
        });
    });

    describe('Normalizing', function() {

        describe('IP Address', function () {

            const anIP = '192.168.0.100';

            it('Should unwrap a quoted value', function () {
                expect(normalizeWebAddress(`"${anIP}"`).url.hostname).to.eq(anIP);
            });

            it('Should normalize an IP to HTTP protocol', function () {
                expect(normalizeWebAddress(anIP).url.protocol).to.eq('http:');
            });

            it('Should normalize an IP without a port to port 80', function () {
                expect(normalizeWebAddress(anIP).port).to.eq(80);
            });

            it('Should normalize an IP to an HTTP URL', function () {
                expect(normalizeWebAddress(anIP).normal).to.eq(`http://${anIP}`);
            });

            it('Should normalize an IP with port 443 to an HTTPS URL', function () {
                expect(normalizeWebAddress(`${anIP}:443`).url.protocol).to.eq(`https:`);
                expect(normalizeWebAddress(`${anIP}:443`).url.toString()).to.include(`https:`);
                expect(normalizeWebAddress(`${anIP}:443`).normal).to.include(`https:`);
                expect(normalizeWebAddress(`${anIP}:443`).port).to.eq(443);
            });

            it('Should not normalize an IP with port 443 if protocol is specified', function () {
                expect(normalizeWebAddress(`http://${anIP}:443`).url.protocol).to.eq(`http:`);
                expect(normalizeWebAddress(`http://${anIP}:443`).url.toString()).to.include(`http:`);
                expect(normalizeWebAddress(`http://${anIP}:443`).normal).to.include(`http:`);
                expect(normalizeWebAddress(`http://${anIP}:443`).port).to.eq(443);
            });

            it('Should normalize an IP with a port and preserve port', function () {
                expect(normalizeWebAddress(`${anIP}:5000`).port).to.eq(5000);
                expect(normalizeWebAddress(`${anIP}:5000`).normal).to.eq(`http://${anIP}:5000`);
                expect(normalizeWebAddress(`${anIP}:5000`).url.protocol).to.eq('http:');
                expect(normalizeWebAddress(`${anIP}:5000`).url.port).to.eq('5000');
            });

            it('Should remove trailing slash', function () {
                expect(normalizeWebAddress(`${anIP}:5000/`).normal).to.eq(`http://${anIP}:5000`);
            });
        });

        describe('Domain', function () {

            const domain = 'subdomain.mydomain.test';

            describe('No Port', function () {

                it('Should normalize an address without protocol to HTTP protocol', function () {
                    expect(normalizeWebAddress(domain).url.protocol).to.eq('http:');
                });

                it('Should normalize an address without protocol to port 80', function () {
                    expect(normalizeWebAddress(domain).port).to.eq(80);
                });

                it('Should normalize an address with http to HTTP protocol', function () {
                    expect(normalizeWebAddress(`http://${domain}`).url.protocol).to.eq('http:');
                });

                it('Should normalize an address with http to port 80', function () {
                    expect(normalizeWebAddress(`http://${domain}`).port).to.eq(80);
                });

                it('Should normalize an address with https to HTTPS protocol', function () {
                    expect(normalizeWebAddress(`https://${domain}`).url.protocol).to.eq('https:');
                });

                it('Should normalize an address with https to port 443', function () {
                    expect(normalizeWebAddress(`https://${domain}`).port).to.eq(443);
                });

            });

            describe('With Port', function () {

                it('Should normalize an address without protocol and with port to specified port and HTTP', function () {
                    expect(normalizeWebAddress(`${domain}:1068`).port).to.eq(1068);
                    expect(normalizeWebAddress(`${domain}:1068`).url.protocol).to.eq('http:');
                });

                it('Should normalize an address without protocol and with port 443 to specified port and HTTPS', function () {
                    expect(normalizeWebAddress(`${domain}:443`).port).to.eq(443);
                    expect(normalizeWebAddress(`${domain}:443`).url.protocol).to.eq('https:');
                });

                it('Should normalize an address with protocol and with port to specified port and protocol', function () {
                    expect(normalizeWebAddress(`https://${domain}:1055`).port).to.eq(1055);
                    expect(normalizeWebAddress(`https://${domain}:1055`).url.protocol).to.eq('https:');
                });

            });

        });

    });

});