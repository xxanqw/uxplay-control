import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const UXPlayIndicator = GObject.registerClass(
    class UXPlayIndicator extends PanelMenu.Button {
        _init(settings, openPrefsCallback, isUxPlayAvailable) {
            super._init(0.5, 'UXPlay Control');

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

            if (!this._settings) {
                console.error('UXPlayIndicator: Received null settings object. UXPlay control may not function correctly with custom settings.');
            } else {
                console.log('UXPlayIndicator: Successfully initialized with provided GSettings object.');
            }

            this._icon = new St.Icon({
                gicon: Gio.icon_new_for_string('resource:///org/gnome/shell/extensions/uxplay-control/icons/overlapping-windows-symbolic.svg'),
                style_class: 'system-status-icon'
            });
            this.add_child(this._icon);

            this._statusItem = new PopupMenu.PopupMenuItem('Status: Stopped', { reactive: false });

            this._toggleItem = new PopupMenu.PopupImageMenuItem('', 'media-playback-start-symbolic');
            this._toggleItem.connect('activate', () => this._toggleUXPlay());

            this._settingsItem = new PopupMenu.PopupImageMenuItem('Preferences', 'preferences-system-symbolic');
            this._settingsItem.connect('activate', () => {
                if (this._openPrefsCallback) {
                    this._openPrefsCallback();
                }
            });

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

                const timestamp = GLib.DateTime.new_now_local().format('%Y-%m-%d %H:%M:%S');
                const logEntry = `[${timestamp}] ${isError ? 'STDERR: ' : 'STDOUT: '}${line}`;

                logs.push(logEntry);

                while (logs.length > maxLines && maxLines > 0) {
                    logs.shift();
                }

                this._settings.set_strv('uxplay-logs', logs);
            } catch (e) {
                console.error(`UXPlayControl: Failed to add log message: ${e.message}`);
            }
        }

        _readFromPipe(dataInputStream, isErrorStream, cancellable) {
            if (!dataInputStream) {
                console.log(`UXPlayControl: _readFromPipe called with null dataInputStream for ${isErrorStream ? 'stderr' : 'stdout'}.`);
                return;
            }

            dataInputStream.read_line_async(GLib.PRIORITY_DEFAULT, cancellable, (source, res) => {
                if (cancellable && cancellable.is_cancelled()) {
                    console.log(`UXPlayControl: Pipe reading cancelled for ${isErrorStream ? 'stderr' : 'stdout'}.`);
                    try {
                        source?.close_async(GLib.PRIORITY_DEFAULT, null, null);
                    } catch (e) { /* ignore */ }
                    return;
                }
                try {
                    const [lineBytes, length] = source.read_line_finish_utf8(res);
                    if (lineBytes !== null) {
                        const line = lineBytes.toString();
                        this._addLogMessage(line, isErrorStream);
                        this._readFromPipe(dataInputStream, isErrorStream, cancellable);
                    } else {
                        console.log(`UXPlayControl: EOF reached on ${isErrorStream ? 'stderr' : 'stdout'} pipe.`);
                        if (isErrorStream) {
                            this._stderrDataInputStream?.close_async(GLib.PRIORITY_DEFAULT, null, null);
                            this._stderrDataInputStream = null;
                        } else {
                            this._stdoutDataInputStream?.close_async(GLib.PRIORITY_DEFAULT, null, null);
                            this._stdoutDataInputStream = null;
                        }
                    }
                } catch (e) {
                    if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                        console.log(`UXPlayControl: Pipe reading operation was cancelled for ${isErrorStream ? 'stderr' : 'stdout'}.`);
                    } else {
                        console.error(`UXPlayControl: Error reading from pipe (${isErrorStream ? 'stderr' : 'stdout'}): ${e.message}`);
                    }
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
                this._stdoutDataInputStream?.close_async(GLib.PRIORITY_DEFAULT, null, (_s, _r) => {
                    this._stdoutStream?.close_async(GLib.PRIORITY_DEFAULT, null, null);
                    this._stdoutStream = null;
                });
                this._stdoutDataInputStream = null;
            } catch (e) { console.error(`UXPlayControl: Error closing stdout data stream: ${e.message}`); }

            try {
                this._stderrDataInputStream?.close_async(GLib.PRIORITY_DEFAULT, null, (_s, _r) => {
                    this._stderrStream?.close_async(GLib.PRIORITY_DEFAULT, null, null);
                    this._stderrStream = null;
                });
                this._stderrDataInputStream = null;
            } catch (e) { console.error(`UXPlayControl: Error closing stderr data stream: ${e.message}`); }
        }

        _toggleUXPlay() {
            if (this._isRunning) {
                this._stopUXPlay();
            } else {
                this._startUXPlay();
            }
        }

        _startUXPlay() {
            if (this._isRunning || !this._isUxPlayAvailable) return;

            if (!this._settings) {
                console.error('UXPlay Control Error: Settings object not available. Cannot start UXPlay with custom configuration.');
                return;
            }

            try {
                let command_prefix = ['stdbuf', '-oL'];
                let base_command = ['uxplay'];
                let args = [...command_prefix, ...base_command];

                const serverName = this._settings.get_string('server-name');
                if (serverName) {
                    args.push('-n', serverName);
                }

                if (this._settings.get_boolean('no-hostname')) {
                    args.push('-nh');
                }

                if (this._settings.get_boolean('h265')) {
                    args.push('-h265');
                }

                const securityMode = this._settings.get_int('security-mode');
                if (securityMode === 1) {
                    const pinCode = this._settings.get_string('pin-code');
                    if (pinCode) {
                        args.push('-pin', pinCode);
                    } else {
                        args.push('-pin');
                    }
                } else if (securityMode === 2) {
                    const password = this._settings.get_string('password');
                    if (password) {
                        args.push('-pw', password);
                    }
                }

                if (this._settings.get_boolean('fullscreen')) {
                    args.push('-fs');
                }

                const audioLatency = this._settings.get_double('audio-latency');
                if (audioLatency !== 0.25) {
                    args.push('-al', audioLatency.toString());
                }

                const initialVolume = this._settings.get_double('initial-volume');
                if (initialVolume !== 1.0) {
                    args.push('-as', `pulsesink volume=${initialVolume.toString()}`);
                }

                const resetTimeout = this._settings.get_int('reset-timeout');
                if (resetTimeout !== 15) {
                    args.push('-reset', resetTimeout.toString());
                }

                if (this._settings.get_boolean('debug')) {
                    args.push('-d');
                }

                let proc;
                try {
                    proc = new Gio.Subprocess({
                        argv: args,
                        flags: Gio.SubprocessFlags.STDOUT_PIPE |
                            Gio.SubprocessFlags.STDERR_PIPE |
                            Gio.SubprocessFlags.DO_NOT_REAP_CHILD,
                    });
                    proc.init(null);
                    console.log(`UXPlayControl: Gio.Subprocess initialized for command: ${args.join(' ')}`);
                } catch (e) {
                    console.error(`UXPlayControl: Gio.Subprocess.init failed: ${e.message}`);
                    this._addLogMessage(`Failed to initialize UXPlay process: ${e.message}`, true);
                    return;
                }

                this._uxplaySubprocess = proc;
                this._uxplayProcess = proc.get_identifier();
                this._isRunning = true;

                this._stdoutStream = this._uxplaySubprocess.get_stdout_pipe();
                this._stderrStream = this._uxplaySubprocess.get_stderr_pipe();

                if (this._stdoutStream) {
                    console.log('UXPlayControl: Setting up stdout pipe.');
                    this._stdoutCancellable = new Gio.Cancellable();
                    this._stdoutDataInputStream = new Gio.DataInputStream({ base_stream: this._stdoutStream });
                    this._readFromPipe(this._stdoutDataInputStream, false, this._stdoutCancellable);
                } else {
                    console.warn('UXPlayControl: stdout pipe not available.');
                }

                if (this._stderrStream) {
                    console.log('UXPlayControl: Setting up stderr pipe.');
                    this._stderrCancellable = new Gio.Cancellable();
                    this._stderrDataInputStream = new Gio.DataInputStream({ base_stream: this._stderrStream });
                    this._readFromPipe(this._stderrDataInputStream, true, this._stderrCancellable);
                } else {
                    console.warn('UXPlayControl: stderr pipe not available.');
                }

                this._updateUI();
                console.log(`UXPlay Control: UXPlay started successfully with PID ${this._uxplayProcess}`);
                this._addLogMessage(`UXPlay process started (PID: ${this._uxplayProcess}).`, false);

                GLib.child_watch_add(GLib.PRIORITY_DEFAULT, this._uxplayProcess, (pid, status) => {
                    this._isRunning = false;
                    this._uxplayProcess = null;
                    this._uxplaySubprocess = null;
                    this._closePipes();
                    this._updateUI();
                    const logMessage = `UXPlay process (PID: ${pid}) exited with status ${status}.`;
                    console.log(`UXPlay Control: ${logMessage}`);
                    this._addLogMessage(logMessage, (status !== 0 && status !== 15 && status !== 9));
                });

            } catch (e) {
                console.error('UXPlay Control: Error starting UXPlay: ' + e.message);
                this._addLogMessage(`Error starting UXPlay: ${e.message}`, true);
                this._isRunning = false;
                this._uxplaySubprocess = null;
                this._updateUI();
            }
        }

        _stopUXPlay() {
            if (!this._isRunning || !this._uxplaySubprocess) {
                console.log('UXPlayControl: Stop called but process not running or subprocess instance missing.');
                return;
            }

            this._addLogMessage('Attempting to stop UXPlay process.', false);
            this._closePipes();

            try {
                console.log(`UXPlayControl: Sending SIGTERM to PID ${this._uxplaySubprocess.get_identifier()}`);
                this._uxplaySubprocess.send_signal(15);

                if (this._killTimeoutId) {
                    GLib.Source.remove(this._killTimeoutId);
                    this._killTimeoutId = null;
                }

                this._killTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
                    if (this._isRunning && this._uxplaySubprocess) {
                        console.warn(`UXPlayControl: UXPlay process (PID ${this._uxplaySubprocess.get_identifier()}) did not terminate after 3s, sending SIGKILL.`);
                        try {
                            this._uxplaySubprocess.force_exit();
                        } catch (e) {
                            console.error(`UXPlay Control: Error sending SIGKILL: ${e.message}`);
                        }
                    } else {
                    }
                    this._killTimeoutId = null;
                    return GLib.SOURCE_REMOVE;
                });

            } catch (e) {
                console.error(`UXPlay Control: Error stopping UXPlay (send_signal): ${e.message}`);
            }
        }

        _updateUI() {
            if (!this._isUxPlayAvailable) {
                this._icon.style_class = 'system-status-icon';
                this._icon.style = 'color: #e01b24;';
                this._statusItem.label.text = 'Status: UXPlay not found';
                this._toggleItem.label.text = 'Start UXPlay';
                if (this._toggleItem._icon) {
                    this._toggleItem._icon.icon_name = 'media-playback-start-symbolic';
                }
                this._toggleItem.setSensitive(false);
                return;
            }

            this._icon.style = null;

            if (this._isRunning) {
                this._icon.style_class = 'system-status-icon uxplay-active';
                this._statusItem.label.text = 'Status: Running';
                this._toggleItem.label.text = 'Stop UXPlay';
                if (this._toggleItem._icon) {
                    this._toggleItem._icon.icon_name = 'media-playback-stop-symbolic';
                }
            } else {
                this._icon.style_class = 'system-status-icon';
                this._statusItem.label.text = 'Status: Stopped';
                this._toggleItem.label.text = 'Start UXPlay';
                if (this._toggleItem._icon) {
                    this._toggleItem._icon.icon_name = 'media-playback-start-symbolic';
                }
            }
            this._toggleItem.setSensitive(true);
        }

        destroy() {
            if (this._isRunning && this._uxplaySubprocess) {
                this._addLogMessage('UXPlayIndicator is being destroyed, stopping UXPlay process.', false);
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
    });

export default class UXPlayControlExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
        this._settings = null;
    }

    enable() {
        const resourcePath = GLib.build_filenamev([this.path, 'resources.gresource']);
        try {
            let resource = Gio.Resource.load(resourcePath);
            Gio.resources_register(resource);
            console.log('UXPlayControlExtension: Successfully loaded and registered gresource.');
        } catch (e) {
            console.error(`UXPlayControlExtension: Failed to load gresource from ${resourcePath}. Error: ${e.message}`);
        }

        try {
            this._settings = this.getSettings();
            console.log('UXPlayControlExtension: Successfully loaded GSettings schema in enable().');
        } catch (e) {
            this._settings = null;
            console.error('UXPlayControlExtension: Failed to load GSettings schema in enable(). Error: ' + e.message);
            throw e;
        }

        const isUxPlayAvailable = !!GLib.find_program_in_path('uxplay');

        this._indicator = new UXPlayIndicator(this._settings, () => this.openPreferences(), isUxPlayAvailable);
        Main.panel.addToStatusArea('uxplay-control', this._indicator);
    }

    disable() {
        const resourcePath = GLib.build_filenamev([this.path, 'resources.gresource']);
        try {
            let resource = Gio.Resource.load(resourcePath);
            Gio.resources_unregister(resource);
            console.log('UXPlayControlExtension: Successfully unregistered gresource.');
        } catch (e) {
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._settings = null;
    }
}