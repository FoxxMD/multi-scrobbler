| Environmental Variable | Type    | Default                | Description                                                                 |
| ---------------------- | ------- | ---------------------- | --------------------------------------------------------------------------- |
| _**`YMBRIDGE_ID`**_    | string  |                        | A globally unique ID EX `myComponentId`                                     |
| `YMBRIDGE_NAME`        | string  | Value of `YMBRIDGE_ID` | A vanity name EX `My Cool Component`                                        |
| `YMBRIDGE_ENABLE`      | boolean | true                   | Should this component be used?                                              |
| _**`YMBRIDGE_URL`**_   | string  |                        | URL of the local Python bridge, for example http://yandex-music-bridge:9980 |
| `YMBRIDGE_API_KEY`     | string  |                        | Optional API key sent as X-API-Key to the bridge                            |