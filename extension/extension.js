import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

function _configDir() {
    return GLib.build_filenamev([GLib.get_user_config_dir(), 'uxplay-control']);
}

function _configFile() {
    return GLib.build_filenamev([_configDir(), 'uxplayrc']);
}

function _buildConfigContent(settings) {
    const ts = GLib.DateTime.new_now_local().format('%Y-%m-%d %H:%M:%S');
    const lines = [
        '# UXPlay runtime configuration',
        '# Managed automatically by UXPlay Control GNOME Extension v8',
        `# Last updated: ${ts}`,
        `# Path: ${_configFile()}`,
        '# Edit settings via the Preferences window to keep this file in sync.',
        '#',
        '# You can freely copy this file into global UXPlay config folder, so settings apply even from terminal.',
        '# But global config will not be synced with UXPlay Control.',
        '',
    ];

    const addStringParam = (key, param) => {
        const val = settings.get_string(key).trim();
        if (val) lines.push(`${param} "${val}"`);
    };

    const addBoolParam = (key, param) => {
        if (settings.get_boolean(key)) lines.push(param);
    };

    const serverName = settings.get_string('server-name');
    if (serverName) lines.push(`n "${serverName}"`);
    addBoolParam('no-hostname', 'nh');
    addStringParam('mac-address', 'm');
    addBoolParam('legacy-ports', 'p');
    if (settings.get_boolean('use-custom-ports')) {
        const portCfg = settings.get_string('port-config').trim();
        if (portCfg) lines.push(`p ${portCfg}`); 
    }
    addStringParam('ble-beacon', 'ble');

    const securityMode = settings.get_int('security-mode');
    if (securityMode === 1) {
        const pin = settings.get_string('pin-code');
        lines.push(pin ? `pin ${pin}` : 'pin');
    } else if (securityMode === 2) {
        addStringParam('password', 'pw');
    }
    addStringParam('client-registry', 'reg');
    addBoolParam('restrict-mode', 'restrict');
    addStringParam('allowed-devices', 'allow');
    addStringParam('blocked-devices', 'block');
    addBoolParam('no-hold', 'nohold');
    addBoolParam('no-freeze', 'nofreeze');
    addStringParam('custom-key-path', 'key');

    addBoolParam('h265', 'h265');
    const resPreset = settings.get_int('resolution-preset');
    const resPresets = [
        '1920x1080@60', 
        '3840x2160@60', 
        '1280x720@60', 
        '1170x2532@60', 
        '1290x2796@60', 
        '1080x1920@60',
        '1920x1440@60',
        '2732x2048@60'
    ];
    if (resPreset >= 0 && resPreset < resPresets.length) {
        lines.push(`s ${resPresets[resPreset]}`);
    } else {
        const custom = settings.get_string('custom-resolution');
        if (custom) lines.push(`s ${custom}`);
    }
    addBoolParam('fullscreen', 'fs');
    
    const fpsLimit = settings.get_int('fps-limit');
    if (fpsLimit > 0) lines.push(`fps ${fpsLimit}`);

    const vFlip = settings.get_int('video-flip');
    if (vFlip === 1) lines.push('f H');
    else if (vFlip === 2) lines.push('f V');
    else if (vFlip === 3) lines.push('f I');

    const vRot = settings.get_int('video-rotation');
    if (vRot === 1) lines.push('r R');
    else if (vRot === 2) lines.push('r L');

    addBoolParam('overscan', 'o');
    addBoolParam('disable-video', 'vs 0');
    addBoolParam('no-close-window', 'nc');

    const scrsv = settings.get_int('screensaver');
    if (scrsv > 0) lines.push(`scrsv ${scrsv}`);

    addBoolParam('vsync', 'vsync');
    addBoolParam('async-audio', 'async');
    
    const latency = settings.get_double('audio-latency');
    lines.push(`al ${latency.toFixed(2)}`);

    const volume = settings.get_double('initial-volume');
    const customAs = settings.get_string('gst-audio-sink').trim();
    if (volume !== 1.0) {
        
        if (!customAs) lines.push(`as "pulsesink volume=${volume.toFixed(2)}"`);
    }

    const dbLimits = settings.get_string('db-limits').trim();
    if (dbLimits) lines.push(`db ${dbLimits}`);
    
    addBoolParam('taper-volume', 'taper');
    addStringParam('cover-art-path', 'ca');
    addStringParam('metadata-path', 'md');
    addStringParam('dacp-path', 'dacp');

    addBoolParam('hls-support', 'hls');
    addStringParam('hls-lang', 'lang');

    addStringParam('gst-parser', 'vp');
    addStringParam('gst-decoder', 'vd');
    addStringParam('gst-converter', 'vc');
    addStringParam('gst-video-sink', 'vs');
    if (customAs) lines.push(`as "${customAs}"`);
    addBoolParam('force-sw-decode', 'avdec');
    addBoolParam('force-v4l2', 'v4l2');

    const colorSpace = settings.get_int('color-space');
    if (colorSpace === 1) lines.push('bt709');
    else if (colorSpace === 2) lines.push('srgb');

    addStringParam('vrtp-pipeline', 'vrtp');
    addStringParam('artp-pipeline', 'artp');
    addStringParam('mp4-path', 'mp4');

    addBoolParam('fps-data', 'FPSdata');
    addStringParam('video-dump-path', 'vdmp');
    addStringParam('audio-dump-path', 'admp');
    
    const resetTimeout = settings.get_int('reset-timeout');
    if (resetTimeout !== 15) lines.push(`reset ${resetTimeout}`);

    addBoolParam('debug', 'd');

    return lines.join('\n');
}

function _writeConfigFile(settings) {
    try {
        GLib.mkdir_with_parents(_configDir(), 0o755);
        const content = _buildConfigContent(settings);
        const file = Gio.File.new_for_path(_configFile());
        const [ok] = file.replace_contents(
            new TextEncoder().encode(content),
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null
        );
        if (!ok) throw new Error('replace_contents returned false');
        return true;
    } catch (e) {
        console.error(`UXPlayControl: Failed to write config file: ${e.message}`);
        return false;
    }
}

function _checkAndMigrate(settings) {
    if (settings.get_int('schema-version') >= 8) return;

    const hasCustomSettings = (
        settings.get_string('server-name')       !== 'UXPlay-GNOME' ||
        settings.get_boolean('no-hostname')      !== false           ||
        settings.get_int('security-mode')        !== 0               ||
        settings.get_boolean('h265')             !== false           ||
        settings.get_int('resolution-preset')    !== 0               ||
        settings.get_boolean('fullscreen')       !== false           ||
        settings.get_boolean('vsync')            !== true            ||
        settings.get_double('audio-latency')     !== 0.0             ||
        settings.get_double('initial-volume')    !== 1.0             ||
        settings.get_boolean('use-custom-ports') !== false           ||
        settings.get_int('reset-timeout')        !== 15              ||
        settings.get_boolean('debug')            !== false
    );

    const writeOk = _writeConfigFile(settings);
    settings.set_int('schema-version', 8);

    if (!writeOk) {
        Main.notify(_('UXPlay Control'), _('⚠ Could not create config file at ~/.config/uxplay-control/uxplayrc.'));
        return;
    }

    if (hasCustomSettings) {
        Main.notify(
            _('UXPlay Control — Upgraded to v8'),
            '⚠ Breaking change: UxPlay options are now stored in ~/.config/uxplay-control/uxplayrc.\n\nYour previous preferences were migrated automatically.'
        );
    } else {
        Main.notify(
            'UXPlay Control',
            _('Config file created at ~/.config/uxplay-control/uxplayrc. Manage UxPlay settings through Preferences.')
        );
    }
}

const UXPlayIndicator = GObject.registerClass(
    class UXPlayIndicator extends PanelMenu.Button {
        _init(settings, openPrefsCallback, isUxPlayAvailable) {
            super._init(0.5, _('UXPlay Control'));

            this._uxplayProcess = null;
            this._uxplaySubprocess = null;
            this._isRunning = false;
            this._settings = settings;
            this._openPrefsCallback = openPrefsCallback;
            this._isUxPlayAvailable = isUxPlayAvailable;
            this._stdoutStream = null;
            this._stderrStream = null;
            this._stdoutDataInputStream = null;
            this._stderrDataInputStream = null;
            this._stdoutCancellable = null;
            this._stderrCancellable = null;
            this._killTimeoutId = null;

            this._icon = new St.Icon({
                gicon: Gio.icon_new_for_string('resource:///org/gnome/shell/extensions/uxplay-control/icons/overlapping-windows-symbolic.svg'),
                style_class: 'system-status-icon',
            });
            this.add_child(this._icon);

            this._statusItem = new PopupMenu.PopupMenuItem(_('Status: Stopped'), { reactive: false });
            this._toggleItem = new PopupMenu.PopupImageMenuItem('', 'media-playback-start-symbolic');
            this._toggleItem.connect('activate', () => this._toggleUXPlay());

            this._settingsItem = new PopupMenu.PopupImageMenuItem(_('Preferences'), 'preferences-system-symbolic');
            this._settingsItem.connect('activate', () => this._openPrefsCallback?.());

            this.menu.addMenuItem(this._statusItem);
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.menu.addMenuItem(this._toggleItem);
            this.menu.addMenuItem(this._settingsItem);

            this._updateUI();
        }

        _addLogMessage(line, isError = false) {
            if (!this._settings) return;
            try {
                let logs = this._settings.get_strv('uxplay-logs');
                const maxLines = this._settings.get_int('max-log-lines');
                const ts = GLib.DateTime.new_now_local().format('%Y-%m-%d %H:%M:%S');
                logs.push(`[${ts}] ${isError ? 'STDERR: ' : 'STDOUT: '}${line}`);
                while (logs.length > maxLines && maxLines > 0) logs.shift();
                this._settings.set_strv('uxplay-logs', logs);
            } catch (e) {
                console.error(`UXPlayControl: Failed to add log message: ${e.message}`);
            }
        }

        _readFromPipe(dataInputStream, isErrorStream, cancellable) {
            if (!dataInputStream) return;
            dataInputStream.read_line_async(GLib.PRIORITY_DEFAULT, cancellable, (source, res) => {
                if (cancellable?.is_cancelled()) {
                    source?.close_async(GLib.PRIORITY_DEFAULT, null, null);
                    return;
                }
                try {
                    const [lineBytes] = source.read_line_finish_utf8(res);
                    if (lineBytes !== null) {
                        this._addLogMessage(lineBytes.toString(), isErrorStream);
                        this._readFromPipe(dataInputStream, isErrorStream, cancellable);
                    } else {
                        if (isErrorStream) {
                            this._stderrDataInputStream?.close_async(GLib.PRIORITY_DEFAULT, null, null);
                            this._stderrDataInputStream = null;
                        } else {
                            this._stdoutDataInputStream?.close_async(GLib.PRIORITY_DEFAULT, null, null);
                            this._stdoutDataInputStream = null;
                        }
                    }
                } catch (e) {
                    if (isErrorStream) {
                        this._stderrDataInputStream?.close_async(GLib.PRIORITY_DEFAULT, null, null);
                        this._stderrDataInputStream = null;
                    } else {
                        this._stdoutDataInputStream?.close_async(GLib.PRIORITY_DEFAULT, null, null);
                        this._stdoutDataInputStream = null;
                    }
                }
            });
        }

        _closePipes() {
            this._stdoutCancellable?.cancel();
            this._stdoutCancellable = null;
            this._stderrCancellable?.cancel();
            this._stderrCancellable = null;
            try {
                this._stdoutDataInputStream?.close_async(GLib.PRIORITY_DEFAULT, null, () => {
                    this._stdoutStream?.close_async(GLib.PRIORITY_DEFAULT, null, null);
                    this._stdoutStream = null;
                });
                this._stdoutDataInputStream = null;
            } catch (e) {}
            try {
                this._stderrDataInputStream?.close_async(GLib.PRIORITY_DEFAULT, null, () => {
                    this._stderrStream?.close_async(GLib.PRIORITY_DEFAULT, null, null);
                    this._stderrStream = null;
                });
                this._stderrDataInputStream = null;
            } catch (e) {}
        }

        _toggleUXPlay() {
            if (this._isRunning) this._stopUXPlay();
            else this._startUXPlay();
        }

        _startUXPlay() {
            if (this._isRunning || !this._isUxPlayAvailable || !this._settings) return;

            _writeConfigFile(this._settings);

            try {
                const launcher = new Gio.SubprocessLauncher({
                    flags: Gio.SubprocessFlags.STDOUT_PIPE |
                        Gio.SubprocessFlags.STDERR_PIPE |
                        Gio.SubprocessFlags.DO_NOT_REAP_CHILD,
                });
                launcher.setenv('UXPLAYRC', _configFile(), true);

                let proc;
                try {
                    proc = launcher.spawnv(['stdbuf', '-oL', 'uxplay']);
                } catch (e) {
                    this._addLogMessage(`Failed to start UXPlay: ${e.message}`, true);
                    return;
                }

                this._uxplaySubprocess = proc;
                this._uxplayProcess = proc.get_identifier();
                this._isRunning = true;

                this._stdoutStream = proc.get_stdout_pipe();
                this._stderrStream = proc.get_stderr_pipe();

                if (this._stdoutStream) {
                    this._stdoutCancellable = new Gio.Cancellable();
                    this._stdoutDataInputStream = new Gio.DataInputStream({ base_stream: this._stdoutStream });
                    this._readFromPipe(this._stdoutDataInputStream, false, this._stdoutCancellable);
                }
                if (this._stderrStream) {
                    this._stderrCancellable = new Gio.Cancellable();
                    this._stderrDataInputStream = new Gio.DataInputStream({ base_stream: this._stderrStream });
                    this._readFromPipe(this._stderrDataInputStream, true, this._stderrCancellable);
                }

                this._updateUI();
                this._addLogMessage(`UXPlay started (PID: ${this._uxplayProcess}).`, false);

                GLib.child_watch_add(GLib.PRIORITY_DEFAULT, this._uxplayProcess, (pid, status) => {
                    this._isRunning = false;
                    this._uxplayProcess = null;
                    this._uxplaySubprocess = null;
                    this._closePipes();
                    this._updateUI();
                    this._addLogMessage(`UXPlay (PID: ${pid}) exited with status ${status}.`, status !== 0 && status !== 15 && status !== 9);
                });

            } catch (e) {
                this._addLogMessage(`Error starting UXPlay: ${e.message}`, true);
                this._isRunning = false;
                this._uxplaySubprocess = null;
                this._updateUI();
            }
        }

        _stopUXPlay() {
            if (!this._isRunning || !this._uxplaySubprocess) return;
            this._addLogMessage('Stopping UXPlay…', false);
            this._closePipes();

            try {
                this._uxplaySubprocess.send_signal(15);
                if (this._killTimeoutId) {
                    GLib.Source.remove(this._killTimeoutId);
                    this._killTimeoutId = null;
                }
                this._killTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
                    if (this._isRunning && this._uxplaySubprocess) {
                        try { this._uxplaySubprocess.force_exit(); } catch (_) {}
                    }
                    this._killTimeoutId = null;
                    return GLib.SOURCE_REMOVE;
                });
            } catch (e) {
                console.error(`UXPlayControl: Error stopping UXPlay: ${e.message}`);
            }
        }

        _updateUI() {
            if (!this._isUxPlayAvailable) {
                this._icon.style_class = 'system-status-icon';
                this._icon.style = 'color: #e01b24;';
                this._statusItem.label.text = _('Status: UXPlay not found');
                this._toggleItem.label.text = _('Start UXPlay');
                if (this._toggleItem._icon) this._toggleItem._icon.icon_name = 'media-playback-start-symbolic';
                this._toggleItem.setSensitive(false);
                return;
            }
            this._icon.style = null;
            if (this._isRunning) {
                this._icon.style_class = 'system-status-icon uxplay-active';
                this._statusItem.label.text = _('Status: Running');
                this._toggleItem.label.text = _('Stop UXPlay');
                if (this._toggleItem._icon) this._toggleItem._icon.icon_name = 'media-playback-stop-symbolic';
            } else {
                this._icon.style_class = 'system-status-icon';
                this._statusItem.label.text = _('Status: Stopped');
                this._toggleItem.label.text = _('Start UXPlay');
                if (this._toggleItem._icon) this._toggleItem._icon.icon_name = 'media-playback-start-symbolic';
            }
            this._toggleItem.setSensitive(true);
        }

        destroy() {
            if (this._isRunning && this._uxplaySubprocess) {
                this._stopUXPlay();
            } else {
                this._closePipes();
            }
            if (this._killTimeoutId) {
                GLib.Source.remove(this._killTimeoutId);
                this._killTimeoutId = null;
            }
            this._uxplaySubprocess = null;
            super.destroy();
        }
    }
);

export default class UXPlayControlExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
        this._settings = null;
        this._settingsChangedId = null;
    }

    enable() {
        const resourcePath = GLib.build_filenamev([this.path, 'resources.gresource']);
        try {
            Gio.resources_register(Gio.Resource.load(resourcePath));
        } catch (e) {}

        this._settings = this.getSettings();
        _checkAndMigrate(this._settings);

        const _skipKeys = new Set(['uxplay-logs', 'max-log-lines', 'schema-version']);
        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (!_skipKeys.has(key)) _writeConfigFile(this._settings);
        });

        const isUxPlayAvailable = !!GLib.find_program_in_path('uxplay');
        this._indicator = new UXPlayIndicator(this._settings, () => this.openPreferences(), isUxPlayAvailable);
        Main.panel.addToStatusArea('uxplay-control', this._indicator);
    }

    disable() {
        if (this._settingsChangedId && this._settings) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        const resourcePath = GLib.build_filenamev([this.path, 'resources.gresource']);
        try { Gio.resources_unregister(Gio.Resource.load(resourcePath)); } catch (_) {}

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._settings = null;
    }
}
