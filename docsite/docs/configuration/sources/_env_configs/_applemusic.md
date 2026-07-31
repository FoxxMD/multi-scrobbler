| Environmental Variable                     | Type    | Default                  | Description                                                          |
| ------------------------------------------ | ------- | ------------------------ | -------------------------------------------------------------------- |
| _**`APPLEMUSIC_ID`**_                      | string  |                          | A globally unique ID                                                 |
| `APPLEMUSIC_NAME`                          | string  | Value of `APPLEMUSIC_ID` | A vanity name                                                        |
| `APPLEMUSIC_ENABLE`                        | boolean |                          |                                                                      |
| `APPLEMUSIC_KEY_ID`                        | string  |                          |                                                                      |
| `APPLEMUSIC_TEAM_ID`                       | string  |                          |                                                                      |
| `APPLEMUSIC_KEY_P8`                        | string  |                          |                                                                      |
| _**`APPLEMUSIC_MEDIA_USER_TOKEN`**_        | string  |                          |                                                                      |
| `APPLEMUSIC_TOKEN`                         | string  |                          |                                                                      |
| `APPLEMUSIC_ORIGIN_HEADER`                 | string  |                          | Origin header to include in every Apple Music API request.           |
| `APPLEMUSIC_RECOVER_UNCHANGED_TOP_HISTORY` | boolean | true                     | Fixes a quirk where Apple Music's history API hides duplicate plays. |
| `APPLEMUSIC_NORMALIZE_ALBUM`               | boolean | true                     | Removes extraneous suffixes from album data                          |