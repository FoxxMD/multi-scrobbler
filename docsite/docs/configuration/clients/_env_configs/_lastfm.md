| Environmental Variable | Type    | Default                               | Description                                             |
| ---------------------- | ------- | ------------------------------------- | ------------------------------------------------------- |
| **`LASTFM_ID`**        | string  |                                       | A globally unique ID                                    |
| `LASTFM_NAME`          | string  | Value of `LASTFM_ID`                  | A vanity name                                           |
| `LASTFM_ENABLE`        | boolean |                                       |                                                         |
| **`LASTFM_API_KEY`**   | string  |                                       | API Key generated from Last.fm/Libre.fm account         |
| **`LASTFM_SECRET`**    | string  |                                       | Secret generated from Last.fm/Libre.fm account          |
| `LASTFM_REDIRECT_URI`  | string  | http://localhost:9078/lastfm/callback | Optional URI to use for callback.                       |
| `LASTFM_SESSION`       | string  |                                       | Optional session id returned from a completed auth flow |