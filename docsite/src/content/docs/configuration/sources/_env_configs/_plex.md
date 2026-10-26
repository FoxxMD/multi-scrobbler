| Environmental Variable | Type    | Default            | Description                                                                                   |
| ---------------------- | ------- | ------------------ | --------------------------------------------------------------------------------------------- |
| _**`PLEX_ID`**_        | string  |                    | A globally unique ID EX `myComponentId`                                                       |
| `PLEX_NAME`            | string  | Value of `PLEX_ID` | A vanity name EX `My Cool Component`                                                          |
| `PLEX_ENABLE`          | boolean | true               | Should this component be used?                                                                |
| _**`PLEX_URL`**_       | string  |                    | http(s)://HOST:PORT of the Plex server to connect to                                          |
| `PLEX_TOKEN`           | string  |                    |                                                                                               |
| `PLEX_USERS_ALLOW`     | string  |                    | Only scrobble for specific users from this comma-delimited list                               |
| `PLEX_USERS_BLOCK`     | string  |                    | Do not scrobble for users from this comma-delimited list                                      |
| `PLEX_DEVICES_ALLOW`   | string  |                    | Do not scrobble if device or application name contains strings from this comma-delimited list |
| `PLEX_DEVICES_BLOCK`   | string  |                    | Only scrobble if device or application name contains strings from this comma-delimited list   |
| `PLEX_LIBRARIES_ALLOW` | string  |                    | Only scrobble if library name contains string from this comma-delimited list                  |
| `PLEX_LIBRARIES_BLOCK` | string  |                    | Do not scrobble if library name contains strings from this comma-delimited list               |