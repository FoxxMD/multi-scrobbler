| Environmental Variable  | Type    | Default                        | Description                                                                                |
| ----------------------- | ------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| _**`MOPIDY_ID`**_       | string  |                                | A globally unique ID EX `myComponentId`                                                    |
| `MOPIDY_NAME`           | string  | Value of `MOPIDY_ID`           | A vanity name EX `My Cool Component`                                                       |
| `MOPIDY_ENABLE`         | boolean | true                           | Should this component be used?                                                             |
| `MOPIDY_URL`            | string  | ws://localhost:6680/mopidy/ws/ | URL of the Mopidy HTTP server to connect to                                                |
| `MOPIDY_URI_DENYLIST`   | string  |                                | Do not scrobble tracks whose URI STARTS WITH any of these strings, case-insensitive        |
| `MOPIDY_URI_ALLOWLIST`  | string  |                                | Only scrobble tracks whose URI STARTS WITH any of these strings, case-insensitive          |
| `MOPIDY_ALBUM_DENYLIST` | string  | Soundcloud                     | Remove album data that matches any case-insensitive string from this list when scrobbling, |