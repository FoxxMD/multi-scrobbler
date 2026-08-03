| Environmental Variable | Type    | Default             | Description                                                                            |
| ---------------------- | ------- | ------------------- | -------------------------------------------------------------------------------------- |
| _**`MPRIS_ID`**_       | string  |                     | A globally unique ID EX `myComponentId`                                                |
| `MPRIS_NAME`           | string  | Value of `MPRIS_ID` | A vanity name EX `My Cool Component`                                                   |
| `MPRIS_ENABLE`         | boolean | true                | Should this component be used?                                                         |
| `MPRIS_BLACKLIST`      | string  |                     | DO NOT scrobble from any players that START WITH values from this comma-delimited list |
| `MPRIS_WHITELIST`      | string  |                     | ONLY scrobble from any players that START WITH values from this comma-delimited list   |