import { childLogger } from "@foxxmd/logging";
import { URLData } from "../../../../core/Atomic.js";
import { joinedUrl, normalizeWSAddress } from "../../../utils/NetworkUtils.js";
import { AbstractApiOptions } from "../../infrastructure/Atomic.js";
import { AzuracastData, AzuraStationResponse } from "../../infrastructure/config/source/azuracast.js";
import AbstractApiClient from "../AbstractApiClient.js";
import { WS, CloseEvent, ErrorEvent, RetryEvent } from 'iso-websocket'


export class AzuracastApiClient extends AbstractApiClient {

    declare config: AzuracastData

    urlData: URLData;

    wsNowPlaying: AzuraStationResponse
    wsCurrenTime: number = 0;
    socket!: WS;

    constructor(name: any, config: AzuracastData, options: AbstractApiOptions) {
        super('Azuracast API', name, config, options);

        this.urlData = normalizeWSAddress(config.url);
    }

    connectWS() {

        const url = joinedUrl(this.urlData.url, '/api/live/nowplaying/websocket');
        const socket = new WebSocket(url);

        socket.onopen = (e) => {
            socket.send(JSON.stringify({
              subs: {
                [`station:${this.config.station}`]: {"recover": true}
              }
            }));
        };

        socket.onerror = (e) => {
            this.logger.error(e);
        }          
          
          // Handle a now-playing event from a station. Update your now-playing data accordingly.
          function handleSseData(ssePayload, useTime = true) {
            const jsonData = ssePayload.data;
          
            if (useTime && 'current_time' in jsonData) {
              this.wsCurrenTime = jsonData.current_time;
            }
          
            this.wsNowPlaying = jsonData.np as AzuraStationResponse;
          }
          
          socket.onmessage = (e) => {

            const jsonData = JSON.parse(e.data as string);
          
            if ('connect' in jsonData) {
              const connectData = jsonData.connect;
          
              if ('data' in connectData) {
                // Legacy SSE data
                connectData.data.forEach(
                  (initialRow) => handleSseData(initialRow)
                );
              } else {
                // New Centrifugo time format
                if ('time' in connectData) {
                   this.wsCurrenTime = Math.floor(connectData.time / 1000);
                }
          
                // New Centrifugo cached NowPlaying initial push.
                for (const subName in connectData.subs) {
                  const sub = connectData.subs[subName];
                  if ('publications' in sub && sub.publications.length > 0) {
                    sub.publications.forEach((initialRow) => handleSseData(initialRow, false));
                  }
                }
              }
            } else if ('pub' in jsonData) {
              handleSseData(jsonData.pub);
            }
          };
    }
}