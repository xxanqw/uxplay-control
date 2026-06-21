import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const _autostartDir  = GLib.build_filenamev([GLib.get_user_config_dir(), 'autostart']);
const _autostartFile = GLib.build_filenamev([_autostartDir, 'uxplay-control.desktop']);
const _uxplayrcPath  = GLib.build_filenamev([GLib.get_user_config_dir(), 'uxplay-control', 'uxplayrc']);

export function syncAutostart(settings) {
    const file = Gio.File.new_for_path(_autostartFile);
    if (!settings.get_boolean('autostart-on-login')) {
        try { file.delete(null); } catch (_) {}
        return;
    }
    try {
        const dir = Gio.File.new_for_path(_autostartDir);
        if (!dir.query_exists(null)) dir.make_directory_with_parents(null);
    } catch (e) {
        console.error(`UXPlayControl: Failed to create autostart directory: ${e.message}`);
        return;
    }
    const delay = Math.max(0, settings.get_int('autostart-delay'));
    const exec = delay > 0
        ? `sh -c "sleep ${delay}; exec env UXPLAYRC='${_uxplayrcPath}' uxplay"`
        : `env UXPLAYRC='${_uxplayrcPath}' uxplay`;
    const body = [
        '[Desktop Entry]',
        'Type=Application',
        'Name=UXPlay Control',
        'Comment=AirPlay mirroring server',
        `Exec=${exec}`,
        'Icon=preferences-system-symbolic',
        'Terminal=false',
        'Categories=Network;',
        'X-GNOME-Autostart-enabled=true',
        '',
    ].join('\n');
    try {
        const [ok] = file.replace_contents(
            new TextEncoder().encode(body),
            null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null
        );
        if (!ok) throw new Error('replace_contents returned false');
    } catch (e) {
        console.error(`UXPlayControl: Failed to write autostart .desktop: ${e.message}`);
    }
}
