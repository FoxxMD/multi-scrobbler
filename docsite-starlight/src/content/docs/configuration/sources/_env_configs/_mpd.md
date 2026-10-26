| Environmental Variable | Type    | Default           | Description                                                                                              |
| ---------------------- | ------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| _**`MPD_ID`**_         | string  |                   | A globally unique ID EX `myComponentId`                                                                  |
| `MPD_NAME`             | string  | Value of `MPD_ID` | A vanity name EX `My Cool Component`                                                                     |
| `MPD_ENABLE`           | boolean | true              | Should this component be used?                                                                           |
| `MPD_URL`              | string  | localhost:6600    | URL:PORT of the MPD server to connect to                                                                 |
| `MPD_PASSWORD`         | string  |                   | Password for the server, if set https://mpd.readthedocs.io/en/stable/user.html#permissions-and-passwords |