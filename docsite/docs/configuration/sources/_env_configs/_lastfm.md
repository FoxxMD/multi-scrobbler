| Environmental Variable        | Type    | Default                               | Description                                             |
| ----------------------------- | ------- | ------------------------------------- | ------------------------------------------------------- |
| _**`SOURCE_LASTFM_ID`**_      | string  |                                       | A globally unique ID                                    |
| `SOURCE_LASTFM_NAME`          | string  | Value of `SOURCE_LASTFM_ID`           | A vanity name                                           |
| `SOURCE_LASTFM_ENABLE`        | boolean |                                       |                                                         |
| _**`SOURCE_LASTFM_API_KEY`**_ | string  |                                       | API Key generated from Last.fm/Libre.fm account         |
| _**`SOURCE_LASTFM_SECRET`**_  | string  |                                       | Secret generated from Last.fm/Libre.fm account          |
| `SOURCE_LASTFM_REDIRECT_URI`  | string  | http://localhost:9078/lastfm/callback | Optional URI to use for callback.                       |
| `SOURCE_LASTFM_SESSION`       | string  |                                       | Optional session id returned from a completed auth flow |