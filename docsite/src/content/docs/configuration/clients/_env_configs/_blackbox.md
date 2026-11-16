| Environmental Variable     | Type               | Default                | Description                                                                                    |
| -------------------------- | ------------------ | ---------------------- | ---------------------------------------------------------------------------------------------- |
| _**`BLACKBOX_ID`**_        | string             |                        | A globally unique ID EX `myComponentId`                                                        |
| `BLACKBOX_NAME`            | string             | Value of `BLACKBOX_ID` | A vanity name EX `My Cool Component`                                                           |
| `BLACKBOX_ENABLE`          | boolean            | true                   | Should this component be used?                                                                 |
| _**`BLACKBOX_ENDPOINT`**_  | string             |                        | URL scrobble payloads are sent to                                                              |
| `BLACKBOX_ENDPOINT_HEALTH` | string             |                        | URL to use for testing service is reachable and ready. Any 2xx response is treated as success. |
| `BLACKBOX_PAYLOAD_STYLE`   | listenbrainz OR ms | ms                     | Format of the payload sent to endpoint                                                         |