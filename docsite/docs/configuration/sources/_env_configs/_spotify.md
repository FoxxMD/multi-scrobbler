| Environmental Variable        | Type    | Default                        | Description                                                          |
| ----------------------------- | ------- | ------------------------------ | -------------------------------------------------------------------- |
| _**`SPOTIFY_ID`**_            | string  |                                | A globally unique ID EX `myComponentId`                              |
| `SPOTIFY_NAME`                | string  | Value of `SPOTIFY_ID`          | A vanity name EX `My Cool Component`                                 |
| `SPOTIFY_ENABLE`              | boolean | true                           | Should this component be used?                                       |
| _**`SPOTIFY_CLIENT_ID`**_     | string  |                                | spotify client id                                                    |
| _**`SPOTIFY_CLIENT_SECRET`**_ | string  |                                | spotify client secret                                                |
| `SPOTIFY_REDIRECT_URI`        | string  | http://localhost:9078/callback | spotify redirect URI -- required only if not the default shown here. |