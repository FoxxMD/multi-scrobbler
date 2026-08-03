| Environmental Variable | Type    | Default             | Description                                                                                  |
| ---------------------- | ------- | ------------------- | -------------------------------------------------------------------------------------------- |
| _**`MC_ID`**_          | string  |                     | A globally unique ID EX `myComponentId`                                                      |
| `MC_NAME`              | string  | Value of `MC_ID`    | A vanity name EX `My Cool Component`                                                         |
| `MC_ENABLE`            | boolean | true                | Should this component be used?                                                               |
| `MC_URL`               | string  | ws://localhost:7905 | URL of the Musikcube Websocket (Metadata) server to connect to                               |
| _**`MC_PASSWORD`**_    | string  |                     | Password set in Musikcube https://github.com/clangen/musikcube/wiki/remote-api-documentation |