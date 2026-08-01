| Environmental Variable | Type    | Default          | Description                                                                                     |
| ---------------------- | ------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| _**`CC_ID`**_          | string  |                  | A globally unique ID EX `myComponentId`                                                         |
| `CC_NAME`              | string  | Value of `CC_ID` | A vanity name EX `My Cool Component`                                                            |
| `CC_ENABLE`            | boolean | true             | Should this component be used?                                                                  |
| `CC_BLACKLIST_DEVICES` | string  |                  | DO NOT scrobble from any cast devices on this comma-delimited list that START WITH these values |
| `CC_WHITELIST_DEVICES` | string  |                  | ONLY scrobble from any cast device on this comma-delimited list that START WITH these values    |
| `CC_BLACKLIST_APPS`    | string  |                  | DO NOT scrobble from any application on this comma-delimited list that START WITH these values  |
| `CC_WHITELIST_APPS`    | string  |                  | ONLY scrobble from any application on this comma-delimited list that START WITH these values    |