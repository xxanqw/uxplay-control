<div align=center>

<img src="https://extensions.gnome.org/extension-data/icons/icon_8243.png" alt="Icon" height="256">

# UXPlay Control

[![Get it on GNOME Extensions](https://img.shields.io/badge/Get%20it%20on-GNOME%20Extensions-4A86CF?style=for-the-badge&logo=gnome&logoColor=white)](https://extensions.gnome.org/extension/8243/uxplay-control/)

</div>

UXPlay Control is an extension for GNOME Shell that allows users to start and configure the UXPlay command-line interface through a simple GUI on the top bar and comprehensive settings within the GNOME Extensions app.

### Install it locally
If for some reason you don't want to use the official GNOME Extensions site, you can install the extension manually.  
Don't forget that you need to have `uxplay`, `gnome-tweaks`, and `gnome-extensions` installed on your system to actually use the extension.

1. Clone this repository:
    ```bash
    git clone https://github.com/xxanqw/uxplay-control.git
    cd uxplay-control/extension
    ```

2. Create the extension directory:
    ```bash
    mkdir -p ~/.local/share/gnome-shell/extensions/uxplay-control@xxanqw
    ```

3. Compile GSettings schema:
    ```bash
    glib-compile-schemas schemas/
    ```

4. Compile GResources:
    ```bash
    glib-compile-resources resources.gresource.xml
    ```

5. Copy extension files to the directory:
    ```bash
    cp -r * ~/.local/share/gnome-shell/extensions/uxplay-control@xxanqw/
    ```

6. Restart GNOME Shell (Alt+F2, type `r`, press Enter) and enable the extension.

---


### Credits

This extension serves as a companion to [UXPlay](https://github.com/FDH2/UXPlay), developed by FDH2. Please note that UXPlay **must be installed** independently as a prerequisite for this extension to operate correctly.

**gnome-tweaks**: Available on your distro repositories.
**gnome-extensions**: Available on [Flathub](https://flathub.org/apps/org.gnome.Extensions)

---

<div align=center>

licensed under **GPLv3**  
_made with ❤️ by xxanqw_

