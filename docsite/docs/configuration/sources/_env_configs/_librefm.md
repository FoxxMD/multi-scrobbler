| Environmental Variable        | Type    | Default                                | Description                                                    |
| ----------------------------- | ------- | -------------------------------------- | -------------------------------------------------------------- |
| **`SOURCE_LIBREFM_ID`**       | string  |                                        | A globally unique ID                                           |
| `SOURCE_LIBREFM_NAME`         | string  | Value of `SOURCE_LIBREFM_ID`           | A vanity name                                                  |
| `SOURCE_LIBREFM_ENABLE`       | boolean |                                        |                                                                |
| `SOURCE_LIBREFM_API_KEY`      | string  |                                        | Optional Secret for Libre.fm account                           |
| `SOURCE_LIBREFM_SECRET`       | string  |                                        | Optional Secret for Libre.fm account                           |
| `SOURCE_LIBREFM_REDIRECT_URI` | string  | http://localhost:9078/librefm/callback | Optional URI to use for callback.                              |
| `SOURCE_LIBREFM_SESSION`      | string  |                                        | Optional session id returned from a completed auth flow        |
| `SOURCE_LIBREFM_URLBASE`      | string  | https://libre.fm/2.0/                  | (Optional) The host and path prefix for your Libre.fm instance |