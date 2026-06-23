#!/bin/bash
# Script to compile and package an UXPlay Control Gnome extension

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DIR="$SCRIPT_DIR/extension"
PROJECT_DIR="$SCRIPT_DIR"
PO_DIR="$PROJECT_DIR/po"
BUILD_DIR=$(mktemp -d)
ZIP_OUT_DIR="$EXTENSION_DIR"

echo -e "\033[1;34mBuilding UXPlay Control Gnome extension...\033[0m"

# Clean up old packages
if [ "$(ls -1t "$EXTENSION_DIR"/*.zip 2>/dev/null | head -n 1)" ]; then
    echo -e "\033[1;33m→ Removing old packages\033[0m"
    rm -f "$EXTENSION_DIR"/*.zip
fi

# Update translation template in the source tree
# (do not ship the .pot file; it is a build artifact for translators)
echo -e "\033[1;32m→ Updating translation template\033[0m"
xgettext --from-code=UTF-8 --language=JavaScript \
    -o "$PO_DIR/uxplay-control.pot" \
    "$EXTENSION_DIR/extension.js" \
    "$EXTENSION_DIR/prefs.js" \
    "$EXTENSION_DIR/autostart.js"

# Prepare staging directory (only files intended for the final package)
echo -e "\033[1;32m→ Preparing staging directory\033[0m"
mkdir -p "$BUILD_DIR"

# Copy core source files
cp "$EXTENSION_DIR/extension.js" \
   "$EXTENSION_DIR/prefs.js" \
   "$EXTENSION_DIR/autostart.js" \
   "$EXTENSION_DIR/metadata.json" \
   "$EXTENSION_DIR/stylesheet.css" \
   "$BUILD_DIR/"

# Copy icons and resource manifest
cp -r "$EXTENSION_DIR/icons" "$BUILD_DIR/"
cp "$EXTENSION_DIR/resources.gresource.xml" "$BUILD_DIR/"

# Copy GSettings schema sources (the compiled gschemas.compiled must not be shipped)
mkdir -p "$BUILD_DIR/schemas"
cp "$EXTENSION_DIR/schemas/"*.gschema.xml "$BUILD_DIR/schemas/"

# Compile locales in staging, then remove the po source tree so it is not shipped
echo -e "\033[1;32m→ Compiling locales\033[0m"
mkdir -p "$BUILD_DIR/po"
cp "$PO_DIR/"*.po "$BUILD_DIR/po/"
for po in "$BUILD_DIR/po/"*.po; do
    [ -e "$po" ] || continue
    lang=$(basename "$po" .po)
    mkdir -p "$BUILD_DIR/locale/$lang/LC_MESSAGES"
    msgfmt "$po" -o "$BUILD_DIR/locale/$lang/LC_MESSAGES/uxplay-control.mo"
done
rm -rf "$BUILD_DIR/po"

# Compile schemas for validation, then remove the compiled artifact before packaging
echo -e "\033[1;32m→ Compiling schemas\033[0m"
glib-compile-schemas "$BUILD_DIR/schemas/"
rm -f "$BUILD_DIR/schemas/gschemas.compiled"

# Compile resources
echo -e "\033[1;32m→ Compiling resources\033[0m"
(cd "$BUILD_DIR" && glib-compile-resources resources.gresource.xml)

# Package extension from the staging directory
echo -e "\033[1;32m→ Packaging extension\033[0m"
(cd "$BUILD_DIR" && gnome-extensions pack . \
    --extra-source=resources.gresource \
    --extra-source=locale)

# Move the resulting zip to the extension directory
PACKAGE_NAME=$(ls -1t "$BUILD_DIR"/*.zip | head -n 1)
mv "$PACKAGE_NAME" "$ZIP_OUT_DIR/"
echo -e "\033[1;32m✓ Packaged extension: \033[1;37m$(basename "$PACKAGE_NAME")\033[0m"

# Copy generated runtime artifacts back to the source tree for local development
# (these are gitignored and are not part of the shipped package)
rm -rf "$EXTENSION_DIR/locale"
cp -r "$BUILD_DIR/locale" "$EXTENSION_DIR/"
cp "$BUILD_DIR/resources.gresource" "$EXTENSION_DIR/"

# Clean up staging directory
rm -rf "$BUILD_DIR"

# Ask user if they want to install
echo -e "\033[1;33m→ Do you want to install the extension now? (y/n): \033[0m"
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    echo -e "\033[1;32m→ Installing extension...\033[0m"
    gnome-extensions install "$ZIP_OUT_DIR/$(basename "$PACKAGE_NAME")" --force
    echo -e "\033[1;32m→ Enabling extension...\033[0m"
    echo -e "\033[1;32m✓ Extension installed to enable it restart Gnome Shell and visit an Extensions app!\033[0m"
else
    echo -e "\033[1;36m→ To install manually, run: \033[1;37mgnome-extensions install $(basename "$PACKAGE_NAME")\033[1;36m inside the 'extension' directory\033[0m"
    echo -e "\033[1;36m→ Then enable it using: \033[1;37mgnome-extensions enable uxplay-control@xxanqw\033[0m"
fi
