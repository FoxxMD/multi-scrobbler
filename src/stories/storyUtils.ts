import { JsonPlayObject, PlayLifecycle } from "../core/Atomic.js";

const exampleLifecycle = (): PlayLifecycle => ({
  "input": {
    "device": {
      "id": "3cc6dc47a8551498a70e519ee09cd8423ff9d48c",
      "is_active": true,
      "is_private_session": false,
      "is_restricted": false,
      "name": "Pixel 9a",
      "supports_volume": false,
      "type": "Smartphone",
      "volume_percent": 100
    },
    "shuffle_state": true,
    "smart_shuffle": false,
    "repeat_state": "context",
    "is_playing": true,
    "timestamp": 1773588429309,
    "context": {
      "external_urls": {
        "spotify": "https://open.spotify.com/collection/tracks"
      },
      "href": "https://api.spotify.com/v1/me/tracks",
      "type": "collection",
      "uri": "spotify:user:socrates13:collection"
    },
    "progress_ms": 5455,
    "item": {
      "album": {
        "album_type": "album",
        "artists": [
          {
            "external_urls": {
              "spotify": "https://open.spotify.com/artist/4V8LLVI7PbaPR0K2TGSxFF"
            },
            "href": "https://api.spotify.com/v1/artists/4V8LLVI7PbaPR0K2TGSxFF",
            "id": "4V8LLVI7PbaPR0K2TGSxFF",
            "name": "Tyler, The Creator",
            "type": "artist",
            "uri": "spotify:artist:4V8LLVI7PbaPR0K2TGSxFF"
          }
        ],
        "external_urls": {
          "spotify": "https://open.spotify.com/album/2nkto6YNI4rUYTLqEwWJ3o"
        },
        "href": "https://api.spotify.com/v1/albums/2nkto6YNI4rUYTLqEwWJ3o",
        "id": "2nkto6YNI4rUYTLqEwWJ3o",
        "images": [
          {
            "height": 640,
            "url": "https://i.scdn.co/image/ab67616d0000b2738940ac99f49e44f59e6f7fb3",
            "width": 640
          },
          {
            "height": 300,
            "url": "https://i.scdn.co/image/ab67616d00001e028940ac99f49e44f59e6f7fb3",
            "width": 300
          },
          {
            "height": 64,
            "url": "https://i.scdn.co/image/ab67616d000048518940ac99f49e44f59e6f7fb3",
            "width": 64
          }
        ],
        "name": "Flower Boy",
        "release_date": "2017-07-21",
        "release_date_precision": "day",
        "total_tracks": 14,
        "type": "album",
        "uri": "spotify:album:2nkto6YNI4rUYTLqEwWJ3o"
      },
      "artists": [
        {
          "external_urls": {
            "spotify": "https://open.spotify.com/artist/4V8LLVI7PbaPR0K2TGSxFF"
          },
          "href": "https://api.spotify.com/v1/artists/4V8LLVI7PbaPR0K2TGSxFF",
          "id": "4V8LLVI7PbaPR0K2TGSxFF",
          "name": "Tyler, The Creator",
          "type": "artist",
          "uri": "spotify:artist:4V8LLVI7PbaPR0K2TGSxFF"
        },
        {
          "external_urls": {
            "spotify": "https://open.spotify.com/artist/7pbDxGE6nQSZVfiFdq9lOL"
          },
          "href": "https://api.spotify.com/v1/artists/7pbDxGE6nQSZVfiFdq9lOL",
          "id": "7pbDxGE6nQSZVfiFdq9lOL",
          "name": "Rex Orange County",
          "type": "artist",
          "uri": "spotify:artist:7pbDxGE6nQSZVfiFdq9lOL"
        },
        {
          "external_urls": {
            "spotify": "https://open.spotify.com/artist/1mSJCvDX0W7Dn7S9C6vmvI"
          },
          "href": "https://api.spotify.com/v1/artists/1mSJCvDX0W7Dn7S9C6vmvI",
          "id": "1mSJCvDX0W7Dn7S9C6vmvI",
          "name": "Anna of the North",
          "type": "artist",
          "uri": "spotify:artist:1mSJCvDX0W7Dn7S9C6vmvI"
        }
      ],
      "disc_number": 1,
      "duration_ms": 320720,
      "explicit": true,
      "external_ids": {
        "isrc": "USQX91701279"
      },
      "external_urls": {
        "spotify": "https://open.spotify.com/track/5WNYg3usc6H8N3MBEp4zVk"
      },
      "href": "https://api.spotify.com/v1/tracks/5WNYg3usc6H8N3MBEp4zVk",
      "id": "5WNYg3usc6H8N3MBEp4zVk",
      "is_local": false,
      "name": "Boredom (feat. Rex Orange County & Anna of the North)",
      "popularity": 66,
      "preview_url": "https://p.scdn.co/mp3-preview/64c36bb59fe8c48d0ed5b38dc5a7b0189c1a642b?cid=f85f5aa4211f4ea78aa364547798b340",
      "track_number": 8,
      "type": "track",
      "uri": "spotify:track:5WNYg3usc6H8N3MBEp4zVk"
    },
    "currently_playing_type": "track",
    "actions": {
      "disallows": {
        "resuming": true
      }
    }
  },
  "original": {
    "data": {
      "artists": [
        "Tyler, The Creator",
        "Rex Orange County",
        "Anna of the North"
      ],
      "albumArtists": [
        "Tyler, The Creator"
      ],
      "album": "Flower Boy",
      "track": "Boredom (feat. Rex Orange County & Anna of the North)",
      "duration": 320.72,
      // @ts-ignore
      "playDate": "2026-03-15T15:27:09.309Z",
      "isrc": "USQX91701279",
      "meta": {
        "spotify": {
          "track": "5WNYg3usc6H8N3MBEp4zVk",
          "artist": [
            "4V8LLVI7PbaPR0K2TGSxFF",
            "7pbDxGE6nQSZVfiFdq9lOL",
            "1mSJCvDX0W7Dn7S9C6vmvI"
          ],
          "albumArtist": [
            "4V8LLVI7PbaPR0K2TGSxFF"
          ],
          "album": "2nkto6YNI4rUYTLqEwWJ3o"
        },
        "brainz": {
          "trackNumber": 8
        }
      }
    },
    "meta": {
      "deviceId": "3cc6dc47a8-Pixel 9a",
      "source": "Spotify",
      "musicService": "Spotify",
      "trackId": "5WNYg3usc6H8N3MBEp4zVk",
      "trackProgressPosition": 5.455,
      "scrobbleTsSOC": 1,
      "newFromSource": true,
      "url": {
        "web": "https://open.spotify.com/track/5WNYg3usc6H8N3MBEp4zVk"
      },
      "art": {
        "album": "https://i.scdn.co/image/ab67616d00001e028940ac99f49e44f59e6f7fb3"
      }
    }
  },
  "steps": [
    {
      "name": "preCompare",
      "source": "Spotify - default",
      "patch": {
        "data": {
          "albumArtists": [
            [
              "Tyler, The Creator"
            ],
            0,
            0
          ],
          "album": [
            "Flower Boy",
            "Scum Fuck Flower Boy"
          ],
          "track": [
            "Boredom (feat. Rex Orange County & Anna of the North)",
            "Boredom"
          ],
          "duration": [
            320.72,
            320
          ],
          "meta": {
            "brainz": {
              "recording": [
                "379db622-cc58-4bbf-9a3e-a7fa50b25fd1"
              ],
              "artist": [
                [
                  "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6",
                  "883cbf1f-dcaa-4d17-b9ed-394e1fdabc87",
                  "4d7db1c4-3c00-4140-8c83-c6d99cfdecf4"
                ]
              ],
              "album": [
                "eb340386-6815-4933-9a28-940f7140f009"
              ],
              "releaseGroup": [
                "e248e931-c26c-4c94-aba2-2f89ce583901"
              ]
            }
          }
        }
      },
      "inputs": [
        {
          "type": "mbQuery",
          "input": "isrc:USQX91701279"
        },
        {
          "type": "mbRecording",
          "input": {
            "id": "379db622-cc58-4bbf-9a3e-a7fa50b25fd1",
            "score": 100,
            "artist-credit-id": "c5abb112-bd0f-4155-9c78-9e3baf1b8ea5",
            "title": "Boredom",
            "length": 320000,
            "video": null,
            "artist-credit": [
              {
                "joinphrase": " ft. ",
                "name": "Tyler, The Creator",
                "artist": {
                  "id": "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6",
                  "name": "Tyler, The Creator",
                  "sort-name": "Tyler, The Creator",
                  "aliases": [
                    {
                      "sort-name": "Okonma, Tyler",
                      "name": "Tyler Okonma",
                      "locale": null,
                      "type": null,
                      "primary": null,
                      "begin-date": null,
                      "end-date": null
                    },
                    {
                      "sort-name": "Okonma, T.",
                      "name": "T. Okonma",
                      "locale": null,
                      "type": null,
                      "primary": null,
                      "begin-date": null,
                      "end-date": null
                    },
                    {
                      "sort-name": "Okonma, Tyler Gregory",
                      "type-id": "d4dcd0c0-b341-3612-a332-c0ce797b25cf",
                      "name": "Tyler Gregory Okonma",
                      "locale": null,
                      "type": "Legal name",
                      "primary": null,
                      "begin-date": null,
                      "end-date": null
                    },
                    {
                      "sort-name": "Haley, Wolf",
                      "name": "Wolf Haley",
                      "locale": null,
                      "type": null,
                      "primary": null,
                      "begin-date": null,
                      "end-date": null
                    }
                  ]
                }
              },
              {
                "joinphrase": " & ",
                "name": "Rex Orange County",
                "artist": {
                  "id": "883cbf1f-dcaa-4d17-b9ed-394e1fdabc87",
                  "name": "Rex Orange County",
                  "sort-name": "Rex Orange County",
                  "aliases": [
                    {
                      "sort-name": "O'Connor, Alexander James",
                      "name": "Alexander James O'Connor",
                      "locale": null,
                      "type": null,
                      "primary": null,
                      "begin-date": null,
                      "end-date": null
                    },
                    {
                      "sort-name": "O'Connor, Alexander",
                      "type-id": "d4dcd0c0-b341-3612-a332-c0ce797b25cf",
                      "name": "Alexander O'Connor",
                      "locale": null,
                      "type": "Legal name",
                      "primary": null,
                      "begin-date": null,
                      "end-date": null
                    }
                  ]
                }
              },
              {
                "name": "Anna of the North",
                "artist": {
                  "id": "4d7db1c4-3c00-4140-8c83-c6d99cfdecf4",
                  "name": "Anna of the North",
                  "sort-name": "Anna of the North",
                  "aliases": [
                    {
                      "sort-name": "Lotterud, Anna",
                      "type-id": "d4dcd0c0-b341-3612-a332-c0ce797b25cf",
                      "name": "Anna Lotterud",
                      "locale": null,
                      "type": "Legal name",
                      "primary": null,
                      "begin-date": null,
                      "end-date": null
                    }
                  ]
                }
              }
            ],
            "first-release-date": "2017-07-21",
            "releases": [
              {
                "id": "eb340386-6815-4933-9a28-940f7140f009",
                "status-id": "4e304316-386d-3409-af2e-78857eec5cfe",
                "artist-credit-id": "3289218e-1edd-4ace-91c6-e7af96ce7144",
                "count": 1,
                "title": "Scum Fuck Flower Boy",
                "status": "Official",
                "disambiguation": "Explicit Cover",
                "artist-credit": [
                  {
                    "name": "Tyler, The Creator",
                    "artist": {
                      "id": "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6",
                      "name": "Tyler, The Creator",
                      "sort-name": "Tyler, The Creator"
                    }
                  }
                ],
                "release-group": {
                  "id": "e248e931-c26c-4c94-aba2-2f89ce583901",
                  "type-id": "f529b476-6e62-324f-b0aa-1f3e33d313fc",
                  "primary-type-id": "f529b476-6e62-324f-b0aa-1f3e33d313fc",
                  "title": "Flower Boy",
                  "primary-type": "Album"
                },
                "date": "2017-07-21",
                "country": "US",
                "release-events": [
                  {
                    "date": "2017-07-21",
                    "area": {
                      "id": "489ce91b-6658-3307-9877-795b68554c98",
                      "name": "United States",
                      "sort-name": "United States",
                      "iso-3166-1-codes": [
                        "US"
                      ]
                    }
                  }
                ],
                "track-count": 14,
                "media": [
                  {
                    "id": "f7525bfa-5263-3c90-926b-4f53cfc28021",
                    "position": 1,
                    "format": "CD",
                    "track": [
                      {
                        "id": "931cb165-a25b-4e54-b606-1e3c31c06348",
                        "number": "8",
                        "title": "Boredom",
                        "length": 321000
                      }
                    ],
                    "track-count": 14,
                    "track-offset": 7
                  }
                ],
                "albumScore": 3,
                "albumCompareScore": 0
              },
              {
                "id": "88aba80a-e240-4464-8dad-a32654ba1348",
                "status-id": "4e304316-386d-3409-af2e-78857eec5cfe",
                "artist-credit-id": "3289218e-1edd-4ace-91c6-e7af96ce7144",
                "count": 1,
                "title": "Scum Fuck Flower Boy",
                "status": "Official",
                "artist-credit": [
                  {
                    "name": "Tyler, The Creator",
                    "artist": {
                      "id": "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6",
                      "name": "Tyler, The Creator",
                      "sort-name": "Tyler, The Creator"
                    }
                  }
                ],
                "release-group": {
                  "id": "e248e931-c26c-4c94-aba2-2f89ce583901",
                  "type-id": "f529b476-6e62-324f-b0aa-1f3e33d313fc",
                  "primary-type-id": "f529b476-6e62-324f-b0aa-1f3e33d313fc",
                  "title": "Flower Boy",
                  "primary-type": "Album"
                },
                "date": "2017-07-21",
                "country": "US",
                "release-events": [
                  {
                    "date": "2017-07-21",
                    "area": {
                      "id": "489ce91b-6658-3307-9877-795b68554c98",
                      "name": "United States",
                      "sort-name": "United States",
                      "iso-3166-1-codes": [
                        "US"
                      ]
                    }
                  }
                ],
                "track-count": 14,
                "media": [
                  {
                    "id": "0be9089c-cfa8-36b8-9036-ab3347e48da6",
                    "position": 1,
                    "format": "CD",
                    "track": [
                      {
                        "id": "aeff9385-9073-4c2e-915d-2136dc23be82",
                        "number": "8",
                        "title": "Boredom",
                        "length": 320000
                      }
                    ],
                    "track-count": 14,
                    "track-offset": 7
                  }
                ],
                "albumScore": 3,
                "albumCompareScore": 0
              },
              {
                "id": "dd09e440-879d-447b-9dfa-8547b369548e",
                "status-id": "4e304316-386d-3409-af2e-78857eec5cfe",
                "artist-credit-id": "3289218e-1edd-4ace-91c6-e7af96ce7144",
                "count": 1,
                "title": "Flower Boy",
                "status": "Official",
                "disambiguation": "Apple Digital Master",
                "artist-credit": [
                  {
                    "name": "Tyler, The Creator",
                    "artist": {
                      "id": "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6",
                      "name": "Tyler, The Creator",
                      "sort-name": "Tyler, The Creator"
                    }
                  }
                ],
                "release-group": {
                  "id": "e248e931-c26c-4c94-aba2-2f89ce583901",
                  "type-id": "f529b476-6e62-324f-b0aa-1f3e33d313fc",
                  "primary-type-id": "f529b476-6e62-324f-b0aa-1f3e33d313fc",
                  "title": "Flower Boy",
                  "primary-type": "Album"
                },
                "date": "2017-07-21",
                "country": "XW",
                "release-events": [
                  {
                    "date": "2017-07-21",
                    "area": {
                      "id": "525d4e18-3d00-31b9-a58b-a146a916de8f",
                      "name": "[Worldwide]",
                      "sort-name": "[Worldwide]",
                      "iso-3166-1-codes": [
                        "XW"
                      ]
                    }
                  }
                ],
                "track-count": 14,
                "media": [
                  {
                    "id": "76a1bbb7-74c4-3953-a224-682a51c011c9",
                    "position": 1,
                    "format": "Digital Media",
                    "track": [
                      {
                        "id": "77f18908-29e2-4bc4-a170-67789188a506",
                        "number": "8",
                        "title": "Boredom",
                        "length": 320000
                      }
                    ],
                    "track-count": 14,
                    "track-offset": 7
                  }
                ],
                "albumScore": 2,
                "albumCompareScore": 0
              },
              {
                "id": "c4d321ac-f21d-45e8-aebc-31986fc8233b",
                "status-id": "4e304316-386d-3409-af2e-78857eec5cfe",
                "artist-credit-id": "3289218e-1edd-4ace-91c6-e7af96ce7144",
                "count": 1,
                "title": "Flower Boy",
                "status": "Official",
                "artist-credit": [
                  {
                    "name": "Tyler, The Creator",
                    "artist": {
                      "id": "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6",
                      "name": "Tyler, The Creator",
                      "sort-name": "Tyler, The Creator"
                    }
                  }
                ],
                "release-group": {
                  "id": "e248e931-c26c-4c94-aba2-2f89ce583901",
                  "type-id": "f529b476-6e62-324f-b0aa-1f3e33d313fc",
                  "primary-type-id": "f529b476-6e62-324f-b0aa-1f3e33d313fc",
                  "title": "Flower Boy",
                  "primary-type": "Album"
                },
                "date": "2017-07-21",
                "country": "XW",
                "release-events": [
                  {
                    "date": "2017-07-21",
                    "area": {
                      "id": "525d4e18-3d00-31b9-a58b-a146a916de8f",
                      "name": "[Worldwide]",
                      "sort-name": "[Worldwide]",
                      "iso-3166-1-codes": [
                        "XW"
                      ]
                    }
                  }
                ],
                "track-count": 14,
                "media": [
                  {
                    "id": "359440fa-d653-3ba0-bbb4-57c41c2bdf78",
                    "position": 1,
                    "format": "Digital Media",
                    "track": [
                      {
                        "id": "3496999b-31a1-489d-a395-7f977e0eb00f",
                        "number": "8",
                        "title": "Boredom",
                        "length": 320000
                      }
                    ],
                    "track-count": 14,
                    "track-offset": 7
                  }
                ],
                "albumScore": 2,
                "albumCompareScore": 0
              },
              {
                "id": "523f5e88-9988-436d-ab60-6d514c1f0e15",
                "status-id": "4e304316-386d-3409-af2e-78857eec5cfe",
                "artist-credit-id": "3289218e-1edd-4ace-91c6-e7af96ce7144",
                "count": 1,
                "title": "Flower Boy",
                "status": "Official",
                "artist-credit": [
                  {
                    "name": "Tyler, The Creator",
                    "artist": {
                      "id": "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6",
                      "name": "Tyler, The Creator",
                      "sort-name": "Tyler, The Creator"
                    }
                  }
                ],
                "release-group": {
                  "id": "e248e931-c26c-4c94-aba2-2f89ce583901",
                  "type-id": "f529b476-6e62-324f-b0aa-1f3e33d313fc",
                  "primary-type-id": "f529b476-6e62-324f-b0aa-1f3e33d313fc",
                  "title": "Flower Boy",
                  "primary-type": "Album"
                },
                "date": "2017-07-21",
                "country": "XW",
                "release-events": [
                  {
                    "date": "2017-07-21",
                    "area": {
                      "id": "525d4e18-3d00-31b9-a58b-a146a916de8f",
                      "name": "[Worldwide]",
                      "sort-name": "[Worldwide]",
                      "iso-3166-1-codes": [
                        "XW"
                      ]
                    }
                  }
                ],
                "track-count": 14,
                "media": [
                  {
                    "id": "401a7220-e021-3794-b52d-b7a75fdd8fc0",
                    "position": 1,
                    "format": "CD",
                    "track": [
                      {
                        "id": "106952b2-4331-4132-a69f-e926b11b1536",
                        "number": "8",
                        "title": "Boredom",
                        "length": 320720
                      }
                    ],
                    "track-count": 14,
                    "track-offset": 7
                  }
                ],
                "albumScore": 2,
                "albumCompareScore": 0
              },
              {
                "id": "dacce9af-884c-4b60-a814-12e7d65f01be",
                "status-id": "1156806e-d06a-38bd-83f0-cf2284a808b9",
                "artist-credit-id": "949a7fd5-fe73-3e8f-922e-01ff4ca958f7",
                "count": 1,
                "title": "Insecure Music (Complete Season 02)",
                "status": "Bootleg",
                "artist-credit": [
                  {
                    "name": "Various Artists",
                    "artist": {
                      "id": "89ad4ac3-39f7-470e-963a-56509c546377",
                      "name": "Various Artists",
                      "sort-name": "Various Artists",
                      "disambiguation": "add compilations to this artist"
                    }
                  }
                ],
                "release-group": {
                  "id": "8daa4b76-fb5d-4ece-98c4-beb0aaf09bcb",
                  "type-id": "dd2a21e1-0c00-3729-a7a0-de60b84eb5d1",
                  "primary-type-id": "f529b476-6e62-324f-b0aa-1f3e33d313fc",
                  "title": "Insecure Music (Complete Season 02)",
                  "primary-type": "Album",
                  "secondary-types": [
                    "Compilation",
                    "Soundtrack"
                  ],
                  "secondary-type-ids": [
                    "dd2a21e1-0c00-3729-a7a0-de60b84eb5d1",
                    "22a628ad-c082-3c4f-b1b6-d41665107b88"
                  ]
                },
                "track-count": 74,
                "media": [
                  {
                    "id": "d78e3f46-874b-4acb-968f-826896a81fd7",
                    "position": 1,
                    "format": "Digital Media",
                    "track": [
                      {
                        "id": "db7f1d1f-71a9-4e59-9add-137e265af169",
                        "number": "63",
                        "title": "Boredom"
                      }
                    ],
                    "track-count": 74,
                    "track-offset": 62
                  }
                ],
                "albumScore": 1,
                "albumCompareScore": 0
              },
              {
                "id": "7b19feb7-2c94-4f49-a887-868cde3c5941",
                "status-id": "4e304316-386d-3409-af2e-78857eec5cfe",
                "artist-credit-id": "3289218e-1edd-4ace-91c6-e7af96ce7144",
                "count": 2,
                "title": "Flower Boy",
                "status": "Official",
                "disambiguation": "limited edition translucent yellow",
                "artist-credit": [
                  {
                    "name": "Tyler, The Creator",
                    "artist": {
                      "id": "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6",
                      "name": "Tyler, The Creator",
                      "sort-name": "Tyler, The Creator"
                    }
                  }
                ],
                "release-group": {
                  "id": "e248e931-c26c-4c94-aba2-2f89ce583901",
                  "type-id": "f529b476-6e62-324f-b0aa-1f3e33d313fc",
                  "primary-type-id": "f529b476-6e62-324f-b0aa-1f3e33d313fc",
                  "title": "Flower Boy",
                  "primary-type": "Album"
                },
                "date": "2017-11-27",
                "country": "GB",
                "release-events": [
                  {
                    "date": "2017-11-27",
                    "area": {
                      "id": "8a754a16-0027-3a29-b6d7-2b40ea0481ed",
                      "name": "United Kingdom",
                      "sort-name": "United Kingdom",
                      "iso-3166-1-codes": [
                        "GB"
                      ]
                    }
                  },
                  {
                    "date": "2017-11-27",
                    "area": {
                      "id": "489ce91b-6658-3307-9877-795b68554c98",
                      "name": "United States",
                      "sort-name": "United States",
                      "iso-3166-1-codes": [
                        "US"
                      ]
                    }
                  },
                  {
                    "date": "2017-11-27",
                    "area": {
                      "id": "89a675c2-3e37-3518-b83c-418bad59a85a",
                      "name": "Europe",
                      "sort-name": "Europe",
                      "iso-3166-1-codes": [
                        "XE"
                      ]
                    }
                  }
                ],
                "track-count": 14,
                "media": [
                  {
                    "id": "8051dbab-8499-33b7-a6ad-ebae0991fe35",
                    "position": 2,
                    "format": "Vinyl",
                    "track": [
                      {
                        "id": "3de6c108-2ee1-4a5f-8fc5-446d91168a95",
                        "number": "C1",
                        "title": "Boredom",
                        "length": 324000
                      }
                    ],
                    "track-count": 7,
                    "track-offset": 0
                  }
                ],
                "albumScore": 1,
                "albumCompareScore": 0
              }
            ],
            "isrcs": [
              "USQX91701279"
            ],
            "titleScore": 0,
            "artistScore": 0,
            "albumScore": 0,
            "rankScore": 0
          }
        }
      ]
    }
  ],
  "scrobble": {
    "match": {
      "match": false,
      "score": 0.09299683367479979,
      "breakdowns": [
        "Artist: 0.02 * 0.3 = 0.01",
        "Title: 0.22 * 0.4 = 0.09",
        "Time: (No correlation) 0 * 0.5 = 0.00",
        "Time Detail => Existing: 2026-03-14T20:35:17.000Z - Candidate: 2026-03-15T15:27:14.682Z | Temporal Sameness: No correlation | Play Diff: 68,221s (Needed <10s) | Fuzzy Duration Diff: 67,901s (Needed <= 10s) | Range Comparison N/A",
        "Score 0.09 => No Match"
      ],
      "reason": "Score 0.09 => No Match",
      "closestMatchedPlay": {
        "data": {
          "artists": [
            "Gorillaz"
          ],
          "track": "Tormenta",
          "album": "Cracker Island",
          // @ts-ignore
          "playDate": "2026-03-14T20:35:17.000Z",
          "meta": {
            "brainz": {
              "album": "52518f4a-9543-4f9c-9a86-89052f4bf458"
            }
          }
        },
        "meta": {
          "nowPlaying": false,
          "mbid": "",
          "source": "Lastfm",
          "url": {
            "web": "https://www.last.fm/music/Gorillaz/_/Tormenta"
          },
          "lifecycle": {
            "input": {
              "artist": {
                "url": "https://www.last.fm/music/Gorillaz",
                "name": "Gorillaz",
                "image": [
                  {
                    "size": "small",
                    "#text": "https://lastfm.freetls.fastly.net/i/u/34s/2a96cbd8b46e442fc41c2b86b821562f.png"
                  },
                  {
                    "size": "medium",
                    "#text": "https://lastfm.freetls.fastly.net/i/u/64s/2a96cbd8b46e442fc41c2b86b821562f.png"
                  },
                  {
                    "size": "large",
                    "#text": "https://lastfm.freetls.fastly.net/i/u/174s/2a96cbd8b46e442fc41c2b86b821562f.png"
                  },
                  {
                    "size": "extralarge",
                    "#text": "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png"
                  }
                ],
                "mbid": ""
              },
              "date": {
                "uts": "1773520517",
                "#text": "14 Mar 2026, 20:35"
              },
              "mbid": "",
              "name": "Tormenta",
              "image": [
                {
                  "size": "small",
                  "#text": "https://lastfm.freetls.fastly.net/i/u/34s/507c3f4c1863a05626a445057871b56e.png"
                },
                {
                  "size": "medium",
                  "#text": "https://lastfm.freetls.fastly.net/i/u/64s/507c3f4c1863a05626a445057871b56e.png"
                },
                {
                  "size": "large",
                  "#text": "https://lastfm.freetls.fastly.net/i/u/174s/507c3f4c1863a05626a445057871b56e.png"
                },
                {
                  "size": "extralarge",
                  "#text": "https://lastfm.freetls.fastly.net/i/u/300x300/507c3f4c1863a05626a445057871b56e.png"
                }
              ],
              "url": "https://www.last.fm/music/Gorillaz/_/Tormenta",
              "streamable": "0",
              "album": {
                "mbid": "52518f4a-9543-4f9c-9a86-89052f4bf458",
                "#text": "Cracker Island"
              },
              "loved": "0"
            },
            "original": {
              "data": {
                "artists": [
                  "Gorillaz"
                ],
                "track": "Tormenta",
                "album": "Cracker Island",
                // @ts-ignore
                "playDate": "2026-03-14T20:35:17.000Z",
                "meta": {
                  "brainz": {
                    "album": "52518f4a-9543-4f9c-9a86-89052f4bf458"
                  }
                }
              },
              "meta": {
                "nowPlaying": false,
                "mbid": "",
                "source": "Lastfm",
                "url": {
                  "web": "https://www.last.fm/music/Gorillaz/_/Tormenta"
                }
              }
            },
            "steps": []
          }
        }
      }
    },
    "payload": {
      "artist": "Tyler, The Creator",
      "track": "Boredom",
      "album": "Scum Fuck Flower Boy",
      "timestamp": 1773588738,
      "mbid": "379db622-cc58-4bbf-9a3e-a7fa50b25fd1",
      "duration": 320
    },
    "warnings": [
      "test warning",
      "missing data in response"
    ],
    "response": {
      "scrobbles": {
        "scrobble": {
          "artist": {
            "corrected": "0",
            "#text": "Tyler, The Creator"
          },
          "album": {
            "corrected": "0",
            "#text": "Scum Fuck Flower Boy"
          },
          "track": {
            "corrected": "0",
            "#text": "Boredom"
          },
          "ignoredMessage": {
            "code": "0",
            "#text": ""
          },
          "albumArtist": {
            "corrected": "0",
            "#text": ""
          },
          "timestamp": "1773588738"
        },
        "@attr": {
          "ignored": 0,
          "accepted": 1
        }
      }
    },
    "mergedScrobble": {
      "data": {
        "artists": [
          "Tyler, The Creator",
          "Rex Orange County",
          "Anna of the North"
        ],
        "album": "Scum Fuck Flower Boy",
        "track": "Boredom",
        "duration": 320,
        // @ts-ignore
        "playDate": "2026-03-15T15:32:18.000Z",
        "isrc": "USQX91701279",
        "meta": {
          "spotify": {
            "track": "5WNYg3usc6H8N3MBEp4zVk",
            "artist": [
              "4V8LLVI7PbaPR0K2TGSxFF",
              "7pbDxGE6nQSZVfiFdq9lOL",
              "1mSJCvDX0W7Dn7S9C6vmvI"
            ],
            "albumArtist": [
              "4V8LLVI7PbaPR0K2TGSxFF"
            ],
            "album": "2nkto6YNI4rUYTLqEwWJ3o"
          },
          "brainz": {
            "trackNumber": 8,
            "recording": "379db622-cc58-4bbf-9a3e-a7fa50b25fd1",
            "artist": [
              "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6",
              "883cbf1f-dcaa-4d17-b9ed-394e1fdabc87",
              "4d7db1c4-3c00-4140-8c83-c6d99cfdecf4"
            ],
            "album": "eb340386-6815-4933-9a28-940f7140f009",
            "releaseGroup": "e248e931-c26c-4c94-aba2-2f89ce583901"
          }
        },
        "listenedFor": 293.56100000000004,
        
        "listenRanges": [
          // @ts-ignore
          [
            {
              "timestamp": "2026-03-15T15:27:14.682Z",
              "position": 5.455
            },
            {
              "timestamp": "2026-03-15T15:32:08.223Z",
              "position": 299.016
            }
          ]
        ],
        "repeat": false
      },
      "meta": {
        "deviceId": "3cc6dc47a8-Pixel 9a",
        "source": "Spotify",
        "musicService": "Spotify",
        "trackId": "5WNYg3usc6H8N3MBEp4zVk",
        "trackProgressPosition": 5.455,
        "scrobbleTsSOC": 2,
        "newFromSource": true,
        "url": {
          "web": "https://open.spotify.com/track/5WNYg3usc6H8N3MBEp4zVk"
        },
        "art": {
          "album": "https://i.scdn.co/image/ab67616d00001e028940ac99f49e44f59e6f7fb3"
        }
      }
    }
  }
});

export const examplePlay = (): JsonPlayObject => ({
      "data": {
        "artists": [
          "Tyler, The Creator",
          "Rex Orange County",
          "Anna of the North"
        ],
        "album": "Scum Fuck Flower Boy",
        "track": "Boredom",
        "duration": 320,
        // @ts-ignore
        "playDate": "2026-03-15T15:32:18.000Z",
        "isrc": "USQX91701279",
        "meta": {
          "spotify": {
            "track": "5WNYg3usc6H8N3MBEp4zVk",
            "artist": [
              "4V8LLVI7PbaPR0K2TGSxFF",
              "7pbDxGE6nQSZVfiFdq9lOL",
              "1mSJCvDX0W7Dn7S9C6vmvI"
            ],
            "albumArtist": [
              "4V8LLVI7PbaPR0K2TGSxFF"
            ],
            "album": "2nkto6YNI4rUYTLqEwWJ3o"
          },
          "brainz": {
            "trackNumber": 8,
            "recording": "379db622-cc58-4bbf-9a3e-a7fa50b25fd1",
            "artist": [
              "f6beac20-5dfe-4d1f-ae02-0b0a740aafd6",
              "883cbf1f-dcaa-4d17-b9ed-394e1fdabc87",
              "4d7db1c4-3c00-4140-8c83-c6d99cfdecf4"
            ],
            "album": "eb340386-6815-4933-9a28-940f7140f009",
            "releaseGroup": "e248e931-c26c-4c94-aba2-2f89ce583901"
          }
        },
        "listenedFor": 293.56100000000004,
        "listenRanges": [
          // @ts-ignore
          [
            {
              "timestamp": "2026-03-15T15:27:14.682Z",
              "position": 5.455
            },
            {
              "timestamp": "2026-03-15T15:32:08.223Z",
              "position": 299.016
            }
          ]
        ],
        "repeat": false
      },
      "meta": {
        "deviceId": "3cc6dc47a8-Pixel 9a",
        "source": "Spotify",
        "musicService": "Spotify",
        "trackId": "5WNYg3usc6H8N3MBEp4zVk",
        "trackProgressPosition": 5.455,
        "scrobbleTsSOC": 2,
        "newFromSource": true,
        "url": {
          "web": "https://open.spotify.com/track/5WNYg3usc6H8N3MBEp4zVk"
        },
        "art": {
          "album": "https://i.scdn.co/image/ab67616d00001e028940ac99f49e44f59e6f7fb3"
        },
        lifecycle: exampleLifecycle()
      }
});