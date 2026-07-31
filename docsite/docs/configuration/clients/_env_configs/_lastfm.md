| Environmental Variable | Type    | Default                               | Description                                             |
| ---------------------- | ------- | ------------------------------------- | ------------------------------------------------------- |
| _**`LASTFM_ID`**_      | string  |                                       | A globally unique ID                                    |
| `LASTFM_NAME`          | string  | Value of `LASTFM_ID`                  | A vanity name                                           |
| `LASTFM_ENABLE`        | boolean |                                       |                                                         |
| _**`LASTFM_API_KEY`**_ | string  |                                       | API Key generated from Last.fm/Libre.fm account         |
| _**`LASTFM_SECRET`**_  | string  |                                       | Secret generated from Last.fm/Libre.fm account          |
| `LASTFM_REDIRECT_URI`  | string  | http://localhost:9078/lastfm/callback | Optional URI to use for callback.                       |
| `LASTFM_SESSION`       | string  |                                       | Optional session id returned from a completed auth flow |