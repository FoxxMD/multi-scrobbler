Testing GH Actions with [ACT]

### Test Branch Push

```shell
act -W '.github/act/actTest.yml' -e '.github/act/actBranchEvent.json'
```


### Test Tag Push

```shell
act -W '.github/act/actTest.yml' -e '.github/act/actTagEvent.json'
```
