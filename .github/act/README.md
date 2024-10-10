Testing GH Actions with ACT

Need to have credentials in a [`.secrets` file](https://nektosact.com/usage/index.html#secrets), copy and rename [`.secrets.example`](./secrets.example) to `.secrets`, then fill out blank fields. Required for docker/metadata-action to read...something. Fails with `Parameter token or opts.auth is required` if they are not supplied.

An ENV file can also be made by copy and renaming [`.env.example`](./env.example). Set `NO_DOCKER_BUILD=true` if you only want to test APP_VERSION and docker tags output. 

If running a full docker build for multi-runner workflows you will need to create an [artifact server](https://github.com/nektos/act/issues/329#issuecomment-1905955589) for ACT to work:


```shell
docker pull ghcr.io/jefuller/artifact-server:latest
docker run -d --name artifact-server -p 8082:8080 --add-host host.docker.internal:host-gateway -e AUTH_KEY=foo ghcr.io/jefuller/artifact-server:latest
```

Run the following **from this directory** to make use of `.actrc` and proper working directory.

### Test Branch Test Suite

```shell
act -W '.github/act/testSuite.yml' -e '.github/act/actBranchEvent.json'
```

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

### Test Multi-Runner Push (WIP)

```shell
act -W '.github/act/multiRunnerTest.yml' -e '.github/act/actBranchEvent.json'
```

### Test Multi-Runner Bake Push (WIP)

```shell
act -W '.github/act/multiRunnerBakeTest.yml' -e '.github/act/actBranchEvent.json'
```
