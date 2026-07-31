| Environmental Variable | Type      | Default          | Description                                                                          |
| ---------------------- | --------- | ---------------- | ------------------------------------------------------------------------------------ |
| _**`CC_ID`**_          | string    |                  | A globally unique ID                                                                 |
| `CC_NAME`              | string    | Value of `CC_ID` | A vanity name                                                                        |
| `CC_ENABLE`            | boolean   |                  |                                                                                      |
| `CC_BLACKLIST_DEVICES` | transform |                  | DO NOT scrobble from any cast devices that START WITH these values, case-insensitive |
| `CC_WHITELIST_DEVICES` | transform |                  | ONLY scrobble from any cast device that START WITH these values, case-insensitive    |
| `CC_BLACKLIST_APPS`    | transform |                  | DO NOT scrobble from any application that START WITH these values, case-insensitive  |
| `CC_WHITELIST_APPS`    | transform |                  | ONLY scrobble from any application that START WITH these values, case-insensitive    |