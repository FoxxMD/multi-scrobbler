| Environmental Variable | Type    | Default             | Description                                                                     |
| ---------------------- | ------- | ------------------- | ------------------------------------------------------------------------------- |
| _**`MPRIS_ID`**_       | string  |                     | A globally unique ID                                                            |
| `MPRIS_NAME`           | string  | Value of `MPRIS_ID` | A vanity name                                                                   |
| `MPRIS_ENABLE`         | boolean |                     |                                                                                 |
| `MPRIS_BLACKLIST`      | union   |                     | DO NOT scrobble from any players that START WITH these values, case-insensitive |
| `MPRIS_WHITELIST`      | union   |                     | ONLY from any players that START WITH these values, case-insensitive            |