| Environmental Variable | Type    | Default                                | Description                                                    |
| ---------------------- | ------- | -------------------------------------- | -------------------------------------------------------------- |
| _**`LIBREFM_ID`**_     | string  |                                        | A globally unique ID EX `myComponentId`                        |
| `LIBREFM_NAME`         | string  | Value of `LIBREFM_ID`                  | A vanity name EX `My Cool Component`                           |
| `LIBREFM_ENABLE`       | boolean | true                                   | Should this component be used?                                 |
| `LIBREFM_API_KEY`      | string  |                                        | Optional Secret for Libre.fm account                           |
| `LIBREFM_SECRET`       | string  |                                        | Optional Secret for Libre.fm account                           |
| `LIBREFM_REDIRECT_URI` | string  | http://localhost:9078/librefm/callback | Optional URI to use for callback.                              |
| `LIBREFM_SESSION`      | string  |                                        | Optional session id returned from a completed auth flow        |
| `LIBREFM_URLBASE`      | string  | https://libre.fm/2.0/                  | (Optional) The host and path prefix for your Libre.fm instance |