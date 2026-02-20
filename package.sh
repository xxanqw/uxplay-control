#!/bin/bash
# Script to compile and package an UXPlay Control Gnome extension

set -e  # Exit on any error

echo -e "\033[1;34mBuilding UXPlay Control Gnome extension...\033[0m"

# Change to extension directory
echo -e "\033[1;32m→ Entering extension directory\033[0m"
cd extension

# Clean up old packages
if [ "$(ls -1t *.zip 2>/dev/null | head -n 1)" ]; then
    echo -e "\033[1;33m→ Removing old packages\033[0m"
    rm *.zip
fi


# Compile locales
echo -e "\033[1;32m→ Compiling locales\033[0m"
for po in po/*.po; do
    lang=$(basename "$po" .po)
    mkdir -p "locale/$lang/LC_MESSAGES"
    msgfmt "$po" -o "locale/$lang/LC_MESSAGES/uxplay-control.mo"
done

# Compile schemas
echo -e "\033[1;32m→ Compiling schemas\033[0m"
glib-compile-schemas schemas/

# Compile resources
echo -e "\033[1;32m→ Compiling resources\033[0m"
glib-compile-resources resources.gresource.xml

# Package extension (include compiled gresource)
echo -e "\033[1;32m→ Packaging extension\033[0m"
gnome-extensions pack . --extra-source=resources.gresource

# Show result
PACKAGE_NAME=$(ls -1t *.zip | head -n 1)
echo -e "\033[1;32m✓ Packaged extension: \033[1;37m$PACKAGE_NAME\033[0m"

# Ask user if they want to install
echo -e "\033[1;33m→ Do you want to install the extension now? (y/n): \033[0m"
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    echo -e "\033[1;32m→ Installing extension...\033[0m"
    gnome-extensions install "$PACKAGE_NAME" --force
    echo -e "\033[1;32m→ Enabling extension...\033[0m"
    echo -e "\033[1;32m✓ Extension installed to enable it restart Gnome Shell and visit an Extensions app!\033[0m"
else
    echo -e "\033[1;36m→ To install manually, run: \033[1;37mgnome-extensions install $PACKAGE_NAME\033[1;36m inside the 'extension' directory\033[0m"
    echo -e "\033[1;36m→ Then enable it using: \033[1;37mgnome-extensions enable uxplay-control@xxanqw\033[0m"
fi