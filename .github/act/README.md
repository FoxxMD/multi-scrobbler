Testing GH Actions with [ACT]

Need to have credentials in a [`.secrets` file](https://nektosact.com/usage/index.html#secrets), copy and rename [`.secrets.example`](./secrets.example) to `.secrets`, then fill out blank fields. Required for docker/metadata-action to read...something. Fails with `Parameter token or opts.auth is required` if they are not supplied.

An ENV file can also be made by copy and renaming [`.env.example`](./env.example). Set `NO_DOCKER_BUILD=true` if you only want to test APP_VERSION and docker tags output.

Run the following **from this directory** to make use of `.actrc` and proper working directoy.

### Test Branch Push

```shell
act -W '.github/act/actTest.yml' -e '.github/act/actBranchEvent.json'
```


### Test Tag (Release) Push

```shell
act -W '.github/act/actTest.yml' -e '.github/act/actTagEvent.json'
```


### Test Tag (Pre-Release) Push

```shell
act -W '.github/act/actTest.yml' -e '.github/act/actTagPreEvent.json'
```
