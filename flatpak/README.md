Flatpak build is a little convoluted until someone sets me straight...

# 1. Install Requirements

## Flatpak and flatpak-builder

Install [Flatpak](https://flatpak.org/setup/)

Install [flatpak-builder](https://docs.flatpak.org/en/latest/first-build.html#building-your-first-flatpak)

## Yarn

```console
npm install -g yarn
```

## [flatpak-node-generator](https://github.com/flatpak/flatpak-builder-tools/tree/master/node)

Requires python 3.7+, [pip](https://pip.pypa.io/en/stable/)/[pipx](https://pypa.github.io/pipx/)

## 

# 1. Update Project source

Set the `branch` `tag` or `commit` to use for MS in the `git` source in [`io.github.multiscrobbler.yml`](/flatpak/io.github.multiscrobbler.yml)

# 2. Use Yarn to generate lock file

Currently [flatpak-node-generator](https://github.com/flatpak/flatpak-builder-tools/tree/master/node) does not like building from npm `package-lock.json` so we need to use yarn to create a lock file before using it. I also do not want to switch to yarn as of now because dockerfile and all docs use npm shrug.jpg

From the MS project root:

```console
yarn
```

Should generate a `yarn.lock` file

# 3. Use `flatpak-node-generator` to generate sources

From MS project root:

```
flatpak-node-generator yarn yarn.lock
```

Move `generated-sources.json` into [`/flatpak`](/flatpak)

# 4. Build flatpak

From MS project root:

flatpak-builder --repo=/tmp/multi-scrobbler-repo /tmp/multi-scrobbler-build flatpak/io.github.multiscrobbler.yml --force-clean
