Flatpak build is a little convoluted until someone sets me straight...

# 1. Install Requirements

## Flatpak and flatpak-builder

Install [Flatpak](https://flatpak.org/setup/)

Install [flatpak-builder](https://docs.flatpak.org/en/latest/first-build.html#building-your-first-flatpak)

## [flatpak-node-generator](https://github.com/flatpak/flatpak-builder-tools/tree/master/node)

Requires python 3.7+, [pip](https://pip.pypa.io/en/stable/)/[pipx](https://pypa.github.io/pipx/)

# 2. Update Project source

Set the `branch` `tag` or `commit` to use for MS in the `git` source in [`io.github.multiscrobbler.yml`](/flatpak/io.github.multiscrobbler.yml)

# 3. Use `flatpak-node-generator` to generate sources

First, [make sure `node_modules` is deleted or empty.](https://github.com/flatpak/flatpak-builder-tools/issues/354#issuecomment-1478518442)

Then, from MS project root:

```
flatpak-node-generator npm package-lock.json
```

Move `generated-sources.json` into [`/flatpak`](/flatpak)

# 4. Build flatpak

From MS project root:

```console
cd flatpak
flatpak-builder --repo=/home/yourUser/multi-scrobbler-repo /home/yourUser/multi-scrobbler-build io.github.multiscrobbler.yml --force-clean
```
Add `--install --user` to have the app installed immediately.
