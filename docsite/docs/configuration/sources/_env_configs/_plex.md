| Environmental Variable | Type    | Default            | Description                                                                                      |
| ---------------------- | ------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| _**`PLEX_ID`**_        | string  |                    | A globally unique ID EX `myComponentId`                                                          |
| `PLEX_NAME`            | string  | Value of `PLEX_ID` | A vanity name EX `My Cool Component`                                                             |
| `PLEX_ENABLE`          | boolean | true               | Should this component be used?                                                                   |
| _**`PLEX_URL`**_       | string  |                    | http(s)://HOST:PORT of the Plex server to connect to                                             |
| `PLEX_TOKEN`           | string  |                    |                                                                                                  |
| `PLEX_USERS_ALLOW`     | union   |                    | Only scrobble for specific users (case-insensitive)                                              |
| `PLEX_USERS_BLOCK`     | union   |                    | Do not scrobble for these users (case-insensitive)                                               |
| `PLEX_DEVICES_ALLOW`   | union   |                    | Only scrobble if device or application name contains strings from this list (case-insensitive)   |
| `PLEX_DEVICES_BLOCK`   | union   |                    | Do not scrobble if device or application name contains strings from this list (case-insensitive) |
| `PLEX_LIBRARIES_ALLOW` | union   |                    | Only scrobble if library name contains string from this list (case-insensitive)                  |
| `PLEX_LIBRARIES_BLOCK` | union   |                    | Do not scrobble if library name contains strings from this list (case-insensitive)               |