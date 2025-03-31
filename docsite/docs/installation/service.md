---
sidebar_position: 2
title: 'As a Service'
---

If you have multi-scrobbler installed [locally](installation.mdx#nodejs) you can enable it to run as a background service when you login.

Before running as a service you should run it at least once in the foreground to ensure it can start up correctly!

# [Systemd](https://systemd.io/)

Systemd is system and service manager that is used by [most popular linux distros](https://en.wikipedia.org/wiki/Systemd#Adoption) including [Ubuntu](https://wiki.ubuntu.com/SystemdForUpstartUsers), [Fedora](https://docs.fedoraproject.org/en-US/quick-docs/understanding-and-administering-systemd/), Pop!_OS, [Debian](https://wiki.debian.org/systemd), and [Arch](https://wiki.archlinux.org/title/systemd).

This setup will create a [user service](https://wiki.archlinux.org/title/systemd/User) that runs on login.

## Create A Unit File

Create a new service file for multi-scrobbler under your HOME config:

```bash
mkdir -p ~/.config/systemd/user
touch ~/.config/systemd/user/multi-scrobbler.service
```

In a text editor add contents below to the file you created, `multi-scrobbler.service`:

```ini
[Unit]
Description=multi-scrobbler
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/multi-scrobbler/directory
ExecStart=npm run start
Restart=no

[Install]
WantedBy=default.target
```

## Start the Service

Save the file then run:

```bash
systemctl daemon-reload
systemctl --user enable multi-scrobbler.service
systemctl --user start multi-scrobbler.service
```

This will

* scan for new services and pickup our multi-scrobbler user service
* enable the service to run at login automatically
* start the service now

# Other Service Methods

Open a PR if you would like to document setting up multi-scrobbler for other service managers!
