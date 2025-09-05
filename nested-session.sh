#!/bin/bash
# Run a nested Gnome Shell session for testing the extension

if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
    dbus-run-session -- gnome-shell --nested --wayland
else
    echo "This script only supports Wayland sessions."
    exit 1
fi