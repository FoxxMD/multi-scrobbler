#!/bin/bash

OVERWRITE="0"
CONFIRM="1"
# https://stackoverflow.com/a/14203146
POSITIONAL_ARGS=()

while [[ $# -gt 0 ]]; do
  case $1 in
    -b|--buildpath)
      BUILDPATH="$2"
      shift # past argument
      shift # past value
      ;;
    -o|--overwrite)
      OVERWRITE="1"
      shift # past argument
      ;;
    -y|--yes)
      CONFIRM="0"
      shift # past argument
      ;;
    -*|--*)
      echo "Unknown option $1"
      exit 1
      ;;
    *)
      POSITIONAL_ARGS+=("$1") # save positional arg
      shift # past argument
      ;;
  esac
done

set -- "${POSITIONAL_ARGS[@]}"

if [ ! -f "./io.github.foxxmd.multiscrobbler.yml" ]; then
  echo "Run this script inside the 'flatpak' directory!"
  exit 1
fi

if [ -z "${BUILDPATH}" ]; then
  printf "\nNo build path set, using ./build\n"
  BUILDPATH="${PWD##*/}/build"
fi

printf '\nBuild Path: %s' "${BUILDPATH}"
if [ "$OVERWRITE" = "1" ]; then echo 'Overwrite Sources: True'; else printf 'Overwrite Sources: False\n'; fi

if [ "$CONFIRM" = "1" ]; then
  read -p "Continue? (Y/N): " confirm && [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]] || exit 1
fi

printf '\n'

cd ../

if [ -d ./node_modules ]; then
  echo 'Project node_modules exists, deleting...'
  rm -r node_modules
fi

if [ -d ./docsite/node_modules ]; then
  echo 'Docsite node_modules exists, deleting...'
  rm -r docsite/node_modules
fi

GENERATE_SOURCES="1"

if [ -f "flatpak/generated-sources.0.json" ] || [ -f "flatpak/generated-sources.1.json" ]; then
  if [ "$OVERWRITE" = "0" ]; then
    echo 'Generated sources exist, will not overwrite.';
    GENERATE_SOURCES=0
  else
    echo 'Deleting existing sources...';
    rm -f flatpak/generated-sources.0.json
    rm -f flatpak/generated-sources.1.json
  fi
fi

if [ "$GENERATE_SOURCES" = "1" ]; then
    printf '\nGenerating project sources...\n'
    rm -f generated-sources.json
    flatpak-node-generator npm package-lock.json
    mv generated-sources.json flatpak/generated-sources.0.json

    printf '\nGenerating docsite sources...\n'
    flatpak-node-generator npm docsite/package-lock.json
    mv generated-sources.json flatpak/generated-sources.1.json
fi

cd flatpak || exit

mkdir -p "$BUILDPATH"

printf '\nBuilding flatpak app...\n'
set -x
flatpak-builder --repo="$BUILDPATH"/repo --state-dir="$BUILDPATH"/state "$BUILDPATH"/build io.github.foxxmd.multiscrobbler.yml --force-clean --install --user
# https://stackoverflow.com/questions/2853803/how-to-echo-shell-commands-as-they-are-executed#comment135696350_13718771
{ set +x; } &> /dev/null

echo 'Done!'
