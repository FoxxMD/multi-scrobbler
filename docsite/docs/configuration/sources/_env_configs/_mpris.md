| Environmental Variable | Type    | Default             | Description                                                                     |
| ---------------------- | ------- | ------------------- | ------------------------------------------------------------------------------- |
| _**`MPRIS_ID`**_       | string  |                     | A globally unique ID EX `myComponentId`                                         |
| `MPRIS_NAME`           | string  | Value of `MPRIS_ID` | A vanity name EX `My Cool Component`                                            |
| `MPRIS_ENABLE`         | boolean | true                | Should this component be used?                                                  |
| `MPRIS_BLACKLIST`      | union   |                     | DO NOT scrobble from any players that START WITH these values, case-insensitive |
| `MPRIS_WHITELIST`      | union   |                     | ONLY from any players that START WITH these values, case-insensitive            |