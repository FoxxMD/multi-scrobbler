---
sidebar_position: 2
title: As a Service
description: Local Install as a Service
---

# [Systemd](https://systemd.io/)

Systemd is system and service manager that is used by [most popular linux distros](https://en.wikipedia.org/wiki/Systemd#Adoption) including [Ubuntu](https://wiki.ubuntu.com/SystemdForUpstartUsers), [Fedora](https://docs.fedoraproject.org/en-US/quick-docs/understanding-and-administering-systemd/), Pop!_OS, [Debian](https://wiki.debian.org/systemd), and [Arch](https://wiki.archlinux.org/title/systemd).

This setup will create a [user service](https://wiki.archlinux.org/title/systemd/User) that runs on login.

:::tip

Before running as a service you should run it at least once in the foreground to ensure it can start up correctly!

:::



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

:::tip

If you set [directories for your service](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#:~:text=Table%C2%A02%2E%C2%A0Automatic%20directory%20creation%20and%20environment%20variables) (under `Automatic directory creation and environment variables`), like `StateDirectory`, Multi-Scrobbler will use the [associated environmental variables](/installation#persistent-directories)

:::

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
