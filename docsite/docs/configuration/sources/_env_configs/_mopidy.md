| Environmental Variable  | Type      | Default                        | Description                                                                                |
| ----------------------- | --------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| _**`MOPIDY_ID`**_       | string    |                                | A globally unique ID                                                                       |
| `MOPIDY_NAME`           | string    | Value of `MOPIDY_ID`           | A vanity name                                                                              |
| `MOPIDY_ENABLE`         | boolean   |                                |                                                                                            |
| `MOPIDY_URL`            | string    | ws://localhost:6680/mopidy/ws/ | URL of the Mopidy HTTP server to connect to                                                |
| `MOPIDY_URI_DENYLIST`   | transform |                                | Do not scrobble tracks whose URI STARTS WITH any of these strings, case-insensitive        |
| `MOPIDY_URI_ALLOWLIST`  | transform |                                | Only scrobble tracks whose URI STARTS WITH any of these strings, case-insensitive          |
| `MOPIDY_ALBUM_DENYLIST` | transform | Soundcloud                     | Remove album data that matches any case-insensitive string from this list when scrobbling, |