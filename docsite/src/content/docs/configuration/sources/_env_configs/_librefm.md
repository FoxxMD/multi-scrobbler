| Environmental Variable        | Type    | Default                                | Description                                                    |
| ----------------------------- | ------- | -------------------------------------- | -------------------------------------------------------------- |
| _**`SOURCE_LIBREFM_ID`**_     | string  |                                        | A globally unique ID EX `myComponentId`                        |
| `SOURCE_LIBREFM_NAME`         | string  | Value of `SOURCE_LIBREFM_ID`           | A vanity name EX `My Cool Component`                           |
| `SOURCE_LIBREFM_ENABLE`       | boolean | true                                   | Should this component be used?                                 |
| `SOURCE_LIBREFM_API_KEY`      | string  |                                        | Optional Secret for Libre.fm account                           |
| `SOURCE_LIBREFM_SECRET`       | string  |                                        | Optional Secret for Libre.fm account                           |
| `SOURCE_LIBREFM_REDIRECT_URI` | string  | http://localhost:9078/librefm/callback | Optional URI to use for callback.                              |
| `SOURCE_LIBREFM_SESSION`      | string  |                                        | Optional session id returned from a completed auth flow        |
| `SOURCE_LIBREFM_URLBASE`      | string  | https://libre.fm/2.0/                  | (Optional) The host and path prefix for your Libre.fm instance |