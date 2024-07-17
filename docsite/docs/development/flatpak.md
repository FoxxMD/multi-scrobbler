---
toc_min_heading_level: 2
toc_max_heading_level: 5
sidebar_position: 4
title: Flatpak
description: Building Flatpak App locally
---

:::note

These steps are for building the flatpak from source. If you want to install the application normally then [get it through flathub](../installation/installation.mdx#flatpak)

:::

The final build repo for the flathub version can be found at [flathub/io.github.foxxmd.multiscrobbler](https://github.com/flathub/io.github.foxxmd.multiscrobbler)

## Install Requirements

### Flatpak and flatpak-builder

Install [Flatpak](https://flatpak.org/setup/)

Install [flatpak-builder](https://docs.flatpak.org/en/latest/first-build.html#building-your-first-flatpak)

#### [flatpak-node-generator](https://github.com/flatpak/flatpak-builder-tools/tree/master/node)

Requires python 3.7+, [pip](https://pip.pypa.io/en/stable/)/[pipx](https://pypa.github.io/pipx/)

## Update Project source

Set the `branch` `tag` or `commit` to use for MS in the `source` section of [`io.github.foxxmd.multiscrobbler.yml`](https://github.com/FoxxMD/multi-scrobbler/blob/master/flatpak/io.github.foxxmd.multiscrobbler.yml)

## Generate Sources and Build

### Use Setup Script

A convenience bash script is provided that automates generating offline sources and building the flatpak app for you. This is the recommend method to use.

Located in the project at [`flatpak/setup.sh`](https://github.com/FoxxMD/multi-scrobbler/blob/master/flatpak/setup.sh), run it from the `flatpak` directory with this syntax:

```shell
./setup.sh -o -b /path/to/flatpak/build/dir
```

```
Args:

-o => Delete and overwrite any existing generated sources
-b => The absolute path to the directory that should be used for flatpak build/artifacts. If not defined will use `CWD/build`
-y => Proceed without confirming settings
```

### Manual Setup

If you cannot use `setup.sh` follow the below to manually generate sources and build the flatpak app:

<details>

<summary>Instructions</summary>

#### Use `flatpak-node-generator` to generate sources

First, [make sure `node_modules` is deleted or empty](https://github.com/flatpak/flatpak-builder-tools/issues/354#issuecomment-1478518442) for both the project and `docsite` directories.

Then, from MS project root:

```shell title="PROJECT_DIR"
flatpak-node-generator npm package-lock.json
```

Move `generated-sources.json` into `PROJECT_DIR/flatpak` and rename `generated-sources.0.json`

Then, generate `docsite` sources:

```shell title="PROJECT_DIR"
flatpak-node-generator npm docsite/package-lock.json
```

Move `generated-sources.json` into `PROJECT_DIR/flatpak` and rename `generated-sources.1.json`

#### Build flatpak

In the below command replace `/home/yourUser/multi-scrobbler-flatpak` with a directory to use for storing flatpak build/artifacts.

```shell title="PROJECT_DIR/flatpak"
flatpak-builder --repo=/home/yourUser/multi-scrobbler-flatpak/repo --state-dir=/home/yourUser/multi-scrobbler-flatpak/state /home/yourUser/multi-scrobbler-flatpak/build io.github.foxxmd.multiscrobbler.yml --force-clean
```

:::info

Append `--install --user` to the above command to have the app installed immediately.

::::

</details>


# Run App

If built with `--install --user` (default when using `setup.sh`) you can now run MS using the command

```shell
flatpak run -u io.github.foxxmd.multiscrobbler
```
