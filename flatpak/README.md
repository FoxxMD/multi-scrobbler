NOTE: This steps are for building the flatpak entirely locally, from source. If you want to install the application normally then [get it through flathub](/docs/installation.md#flatpak)

The final build repo for the flathub version can be found at [flathub/io.github.foxxmd.multiscrobbler](https://github.com/flathub/io.github.foxxmd.multiscrobbler)

# 1. Install Requirements

## Flatpak and flatpak-builder

Install [Flatpak](https://flatpak.org/setup/)

Install [flatpak-builder](https://docs.flatpak.org/en/latest/first-build.html#building-your-first-flatpak)

## [flatpak-node-generator](https://github.com/flatpak/flatpak-builder-tools/tree/master/node)

Requires python 3.7+, [pip](https://pip.pypa.io/en/stable/)/[pipx](https://pypa.github.io/pipx/)

# 2. Update Project source

Set the `branch` `tag` or `commit` to use for MS in the `git` source in [`io.github.foxxmd.multiscrobbler.yml`](/flatpak/io.github.foxxmd.multiscrobbler.yml)

# 3. Use `flatpak-node-generator` to generate sources

First, [make sure `node_modules` is deleted or empty.](https://github.com/flatpak/flatpak-builder-tools/issues/354#issuecomment-1478518442)

Then, from MS project root:

```shell
flatpak-node-generator npm package-lock.json
```

Move `generated-sources.json` into [`/flatpak`](/flatpak)

# 4. Build flatpak

From MS project root:

```shell
cd flatpak
flatpak-builder --repo=/home/yourUser/multi-scrobbler-flatpak/repo --state-dir=/home/yourUser/multi-scrobbler-flatpak/state /home/yourUser/multi-scrobbler-flatpak/build io.github.foxxmd.multiscrobbler.yml --force-clean --install --user
```
Add `--install --user` to have the app installed immediately.
# 5. Run (Locally)

If built with `--install --user` you can now run MS using the command

```shell
flatpak run -u io.github.foxxmd.multiscrobbler
```
