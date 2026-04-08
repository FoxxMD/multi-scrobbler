#!/bin/bash
set -e

# based on https://github.com/Kikobeats/og.kikobeats.com/blob/master/static-font.sh

# 1) Freeze SF Pro to Bold (700) and make it fully static
fonttools varLib.instancer AdwaitaSans-Regular.ttf \
  wght=400 \
  --static \
  -o AdwaitaSans-Regular-Static.ttf

# 2) Subset to only the glyphs you actually need (Satori-friendly)
fonttools subset AdwaitaSans-Regular-Static.ttf \
  --text="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#\$%^&*()-_=+[]{};:'\",.<>/? " \
  --no-hinting \
  --name-legacy \
  --output-file=AdwaitaSans-Regular-StaticSubset.ttf

