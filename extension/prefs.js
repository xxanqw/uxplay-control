import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';
import Soup from 'gi://Soup';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class UXPlayControlPreferences extends ExtensionPreferences {
    constructor(metadata) {
        super(metadata);
    }

    fillPreferencesWindow(window) {
        const isUxPlayAvailable = !!GLib.find_program_in_path('uxplay');

        const settings = this.getSettings();

        if (!settings) {
            console.error("UXPlayControlPreferences: GSettings could not be initialized by ExtensionPreferences.");
            const errorPage = new Adw.PreferencesPage({
                title: 'Error',
                icon_name: 'dialog-error-symbolic'
            });
            const errorGroup = new Adw.PreferencesGroup();
            const errorLabel = new Gtk.Label({
                label: "Error: Could not load extension settings.\nPlease ensure the GSettings schema is correctly installed and compiled, and that the extension has been reloaded.",
                wrap: true,
                justify: Gtk.Justification.CENTER
            });
            errorGroup.add(errorLabel);
            errorPage.add(errorGroup);
            window.add(errorPage);
            return;
        }
        console.log('UXPlayControlPreferences: Successfully obtained GSettings object.');

        try {
            const cssProvider = new Gtk.CssProvider();
            const basePath = (this.metadata && this.metadata.path) ? this.metadata.path : this.path;
            if (basePath) {
                const cssPath = GLib.build_filenamev([basePath, 'stylesheet.css']);
                cssProvider.load_from_file(Gio.File.new_for_path(cssPath));
                Gtk.StyleContext.add_provider_for_display(
                    Gdk.Display.get_default(),
                    cssProvider,
                    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
                );
            }
        } catch (e) {
            console.log('Failed to load preferences CSS:', e);
        }

        const getSummary = (key, defaultSubtitle = '') => {
            if (!settings || !settings.settings_schema) {
                return defaultSubtitle;
            }
            const schemaKey = settings.settings_schema.get_key(key);
            if (schemaKey) {
                const summary = schemaKey.get_summary();
                if (summary && summary.length > 0) {
                    return summary;
                }
            }
            return defaultSubtitle;
        };

        const generalPage = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic'
        });

        const serverGroup = new Adw.PreferencesGroup({
            title: 'Server Settings'
        });

        const nameRow = new Adw.EntryRow({
            title: 'Server Name',
            text: settings.get_string('server-name')
        });
        nameRow.connect('changed', () => {
            settings.set_string('server-name', nameRow.text);
        });

        const noHostnameRow = new Adw.SwitchRow({
            title: 'No Hostname Suffix',
            subtitle: getSummary('no-hostname', 'Do not add "@hostname" to server name')
        });
        settings.bind('no-hostname', noHostnameRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        serverGroup.add(nameRow);
        serverGroup.add(noHostnameRow);
        generalPage.add(serverGroup);

        const securityGroup = new Adw.PreferencesGroup({
            title: 'Security Settings'
        });

        const securityModel = new Gtk.StringList();
        securityModel.append('None');
        securityModel.append('PIN Code');
        securityModel.append('Password');

        const securityModeRow = new Adw.ComboRow({
            title: 'Security Mode',
            subtitle: getSummary('security-mode', 'Select the security mode for the server'),
            model: securityModel,
        });
        settings.bind('security-mode', securityModeRow, 'selected', Gio.SettingsBindFlags.DEFAULT);

        const pinCodeRow = new Adw.EntryRow({
            title: 'PIN Code (4-digit)',
            text: settings.get_string('pin-code'),
            visible: settings.get_int('security-mode') === 1
        });

        const passwordRow = new Adw.EntryRow({
            title: 'Password',
            text: settings.get_string('password'),
            visible: settings.get_int('security-mode') === 2
        });

        securityModeRow.connect('notify::selected', () => {
            const selected = securityModeRow.selected;
            pinCodeRow.visible = (selected === 1);
            passwordRow.visible = (selected === 2);
        });

        pinCodeRow.connect('changed', entry => {
            const text = entry.get_text();
            const sanitized = text.replace(/\D/g, '').substring(0, 4);

            if (text !== sanitized) {
                entry.set_text(sanitized);
                entry.set_position(-1);
            }
            settings.set_string('pin-code', sanitized);
        });

        passwordRow.connect('changed', () => {
            settings.set_string('password', passwordRow.text);
        });

        securityGroup.add(securityModeRow);
        securityGroup.add(pinCodeRow);
        securityGroup.add(passwordRow);
        generalPage.add(securityGroup);

        const videoPage = new Adw.PreferencesPage({
            title: 'Video',
            icon_name: 'video-display-symbolic'
        });

        const videoGroup = new Adw.PreferencesGroup({
            title: 'Video Settings'
        });

        const h265Row = new Adw.SwitchRow({
            title: 'H265 Support',
            subtitle: getSummary('h265', 'Enable 4K video support')
        });
        settings.bind('h265', h265Row, 'active', Gio.SettingsBindFlags.DEFAULT);

        const resolutionRow = new Adw.ComboRow({
            title: 'Resolution',
            subtitle: getSummary('resolution-preset')
        });
        const resolutionModel = new Gtk.StringList();
        resolutionModel.append('1920x1080@60');
        resolutionModel.append('3840x2160@60');
        resolutionModel.append('1280x720@60');
        resolutionModel.append('Custom');
        resolutionRow.set_model(resolutionModel);
        resolutionRow.set_selected(settings.get_int('resolution-preset'));
        resolutionRow.connect('notify::selected', () => {
            settings.set_int('resolution-preset', resolutionRow.selected);
        });

        const customResRow = new Adw.EntryRow({
            title: 'Custom Resolution',
            text: settings.get_string('custom-resolution')
        });
        customResRow.connect('changed', () => {
            settings.set_string('custom-resolution', customResRow.text);
        });

        const fullscreenRow = new Adw.SwitchRow({
            title: 'Fullscreen Mode',
            subtitle: getSummary('fullscreen')
        });
        settings.bind('fullscreen', fullscreenRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        videoGroup.add(h265Row);
        videoGroup.add(resolutionRow);
        videoGroup.add(customResRow);
        videoGroup.add(fullscreenRow);
        videoPage.add(videoGroup);

        const audioPage = new Adw.PreferencesPage({
            title: 'Audio',
            icon_name: 'audio-volume-high-symbolic'
        });

        const audioGroup = new Adw.PreferencesGroup({
            title: 'Audio Settings'
        });

        const vsyncRow = new Adw.SwitchRow({
            title: 'Video Sync',
            subtitle: getSummary('vsync', 'Sync audio to video using timestamps')
        });
        settings.bind('vsync', vsyncRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const latencyRow = new Adw.SpinRow({
            title: 'Audio Latency (seconds)',
            adjustment: new Gtk.Adjustment({
                lower: 0.0,
                upper: 2.0,
                step_increment: 0.05,
            }),
            digits: 2
        });
        settings.bind('audio-latency', latencyRow.get_adjustment(), 'value', Gio.SettingsBindFlags.DEFAULT);

        const volumeRow = new Adw.SpinRow({
            title: 'UXPlay Volume',
            subtitle: 'Controls the output volume from UXPlay. Does not affect the source device\'s volume.',
            adjustment: new Gtk.Adjustment({
                lower: 0.0,
                upper: 1.0,
                step_increment: 0.1,
            }),
            digits: 1
        });
        settings.bind('initial-volume', volumeRow.get_adjustment(), 'value', Gio.SettingsBindFlags.DEFAULT);

        audioGroup.add(vsyncRow);
        audioGroup.add(latencyRow);
        audioGroup.add(volumeRow);
        audioPage.add(audioGroup);

        const advancedPage = new Adw.PreferencesPage({
            title: 'Advanced',
            icon_name: 'preferences-other-symbolic'
        });

        const advancedGroup = new Adw.PreferencesGroup({
            title: 'Advanced Options'
        });

        const customPortsRow = new Adw.SwitchRow({
            title: 'Use Custom Ports',
            subtitle: getSummary('use-custom-ports')
        });
        settings.bind('use-custom-ports', customPortsRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const portsRow = new Adw.EntryRow({
            title: 'Port Configuration',
            text: settings.get_string('port-config')
        });
        portsRow.connect('changed', () => {
            settings.set_string('port-config', portsRow.text);
        });

        const resetRow = new Adw.SpinRow({
            title: 'Reset Timeout (seconds)',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 300,
                step_increment: 5,
                value: settings.get_int('reset-timeout')
            })
        });
        resetRow.connect('notify::value', () => {
            settings.set_int('reset-timeout', resetRow.value);
        });

        const debugRow = new Adw.SwitchRow({
            title: 'Debug Logging',
            subtitle: getSummary('debug')
        });
        settings.bind('debug', debugRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        advancedGroup.add(customPortsRow);
        advancedGroup.add(portsRow);
        advancedGroup.add(resetRow);
        advancedGroup.add(debugRow);
        advancedPage.add(advancedGroup);

        const logsPage = new Adw.PreferencesPage({
            title: 'Logs',
            icon_name: 'document-properties-symbolic'
        });

        const logDisplayGroup = new Adw.PreferencesGroup({
            title: 'Application Logs'
        });

        const logTextView = new Gtk.TextView({
            editable: false,
            cursor_visible: false,
            wrap_mode: Gtk.WrapMode.WORD_CHAR,
            vexpand: true,
            hexpand: true
        });

        const logScrolledWindow = new Gtk.ScrolledWindow({
            child: logTextView,
            hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            min_content_height: 200
        });

        logDisplayGroup.add(logScrolledWindow);
        logsPage.add(logDisplayGroup);

        const logControlsGroup = new Adw.PreferencesGroup({
            title: 'Log Management'
        });

        const maxLogLinesRow = new Adw.SpinRow({
            title: 'Maximum Log Lines',
            subtitle: 'Number of log lines to store. Very high values may impact performance.',
            adjustment: new Gtk.Adjustment({
                lower: 100,
                upper: 50000,
                step_increment: 100,
                value: settings.get_int('max-log-lines')
            }),
            digits: 0
        });
        maxLogLinesRow.connect('notify::value', () => {
            settings.set_int('max-log-lines', maxLogLinesRow.value);
        });

        logControlsGroup.add(maxLogLinesRow);


        const clearLogsButton = new Gtk.Button({
            label: 'Clear Logs',
            halign: Gtk.Align.END,
            margin_top: 10,
            margin_bottom: 10
        });
        clearLogsButton.connect('clicked', () => {
            settings.set_strv('uxplay-logs', []);
        });

        const clearLogsActionRow = new Adw.ActionRow({
            title: 'Clear All Stored Logs'
        });
        const clearButtonForAction = new Gtk.Button({ label: 'Clear' });
        clearButtonForAction.connect('clicked', () => {
            settings.set_strv('uxplay-logs', []);
        });
        clearLogsActionRow.add_suffix(clearButtonForAction);
        clearLogsActionRow.set_activatable_widget(clearButtonForAction);

        logControlsGroup.add(clearLogsActionRow);

        logsPage.add(logControlsGroup);

        const aboutPage = new Adw.PreferencesPage({
            title: 'About',
            icon_name: 'help-about-symbolic'
        });

        const extensionGroup = new Adw.PreferencesGroup({
            title: 'Extension Information'
        });

        const md = this.metadata || {};
        const extNameRow = new Adw.ActionRow({ title: 'Name', subtitle: md.name || 'N/A' });
        const extDescRow = new Adw.ActionRow({ title: 'Description', subtitle: md.description || 'N/A' });
        const extVersionRow = new Adw.ActionRow({ title: 'Version', subtitle: String(md.version ?? 'N/A') });
        const extUuidRow = new Adw.ActionRow({ title: 'UUID', subtitle: md.uuid || 'N/A' });
        const extShellRow = new Adw.ActionRow({
            title: 'Supported GNOME Versions',
            subtitle: Array.isArray(md['shell-version']) ? md['shell-version'].join(', ') : 'N/A'
        });

        extensionGroup.add(extNameRow);
        extensionGroup.add(extDescRow);
        extensionGroup.add(extVersionRow);
        extensionGroup.add(extUuidRow);
        extensionGroup.add(extShellRow);

        if (md.url) {
            const homepageRow = new Adw.ActionRow({ title: 'Homepage', subtitle: md.url });
            const linkBtn = new Gtk.LinkButton({ label: 'Open', uri: md.url });
            homepageRow.add_suffix(linkBtn);
            homepageRow.set_activatable_widget(linkBtn);
            extensionGroup.add(homepageRow);
        }

        const developerGroup = new Adw.PreferencesGroup({
            title: 'Developer Information'
        });

        const avatar = new Adw.Avatar({
            size: 100,
            text: 'X',
            halign: Gtk.Align.CENTER
        });
        avatar.add_css_class('about-avatar');

        const loadAvatar = async () => {
            try {
                const session = new Soup.Session();
                const message = Soup.Message.new('GET', 'https://cdn.xserv.pp.ua/files/images/xxanqw/ava2.png');

                const bytes = await new Promise((resolve, reject) => {
                    session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
                        try {
                            const b = session.send_and_read_finish(result);
                            resolve(b);
                        } catch (e) {
                            reject(e);
                        }
                    });
                });

                if (bytes && message.get_status() === Soup.Status.OK) {
                    const stream = Gio.MemoryInputStream.new_from_bytes(bytes);
                    const pixbuf = GdkPixbuf.Pixbuf.new_from_stream_at_scale(stream, 100, 100, true, null);
                    const texture = Gdk.Texture.new_for_pixbuf(pixbuf);
                    avatar.set_custom_image(texture);
                }
            } catch (e) {
                console.log('Could not load avatar image from URL:', e);
            }
        };

        loadAvatar();

        const nicknameLabel = new Gtk.Label({
            label: 'xxanqw',
            halign: Gtk.Align.CENTER
        });
        nicknameLabel.add_css_class('title-3');
        nicknameLabel.add_css_class('about-nickname');

        const devDescLabel = new Gtk.Label({
            label: 'smol ukrainian dev🤫',
            halign: Gtk.Align.CENTER,
            wrap: true
        });
        devDescLabel.add_css_class('dim-label');

        const buttonsBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            halign: Gtk.Align.CENTER,
            css_classes: ['about-buttons']
        });

        const paypalLabel = new Gtk.Label({
            label: 'PayPal: travix10x@icloud.com',
            css_classes: ['about-button'],
            selectable: true
        });

        const bankButton = new Gtk.Button({
            label: 'Support via Bank',
            css_classes: ['about-button']
        });
        bankButton.connect('clicked', () => {
            try {
                Gio.AppInfo.launch_default_for_uri('https://xxanqw.pp.ua/donate', null);
            } catch (e) {
                console.log('Could not open URL:', e);
            }
        });

        const projectButton = new Gtk.Button({
            label: 'Project GitHub',
            css_classes: ['about-button']
        });
        projectButton.connect('clicked', () => {
            try {
                Gio.AppInfo.launch_default_for_uri('https://xxanqw.pp.ua/uxpc', null);
            } catch (e) {
                console.log('Could not open URL:', e);
            }
        });

        buttonsBox.append(paypalLabel);
        buttonsBox.append(bankButton);
        buttonsBox.append(projectButton);

        developerGroup.add(avatar);
        developerGroup.add(nicknameLabel);
        developerGroup.add(devDescLabel);
        developerGroup.add(buttonsBox);

        aboutPage.add(extensionGroup);
        aboutPage.add(developerGroup);

        if (!isUxPlayAvailable) {
            const errorPage = new Adw.PreferencesPage({
                title: 'UXPlay Not Found',
                icon_name: 'dialog-error-symbolic'
            });
            const errorGroup = new Adw.PreferencesGroup();
            const statusPage = new Adw.StatusPage({
                title: 'UXPlay Not Found',
                description: "UXPlay is not installed or not in your system's PATH.\n\nPlease install it and restart GNOME Shell for the extension to work.",
                icon_name: 'dialog-error-symbolic',
                vexpand: true,
            });
            errorGroup.add(statusPage);
            errorPage.add(errorGroup);
            window.add(errorPage);

            generalPage.set_sensitive(false);
            videoPage.set_sensitive(false);
            audioPage.set_sensitive(false);
            advancedPage.set_sensitive(false);
            logsPage.set_sensitive(false);
        }

        window.add(generalPage);
        window.add(videoPage);
        window.add(audioPage);
        window.add(advancedPage);
        window.add(logsPage);
        window.add(aboutPage);

        const loadLogsToView = () => {
            if (!logTextView || !settings) return;

            const logs = settings.get_strv('uxplay-logs');
            const buffer = logTextView.get_buffer();
            buffer.set_text(logs.join('\n'), -1);

            if (logScrolledWindow) {
                const adj = logScrolledWindow.get_vadjustment();
                if (adj) {
                    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                        if (adj.get_upper() > adj.get_page_size()) {
                            adj.set_value(adj.get_upper() - adj.get_page_size());
                        } else {
                            adj.set_value(0);
                        }
                        return GLib.SOURCE_REMOVE;
                    });
                }
            }
        };

        if (isUxPlayAvailable) {
            loadLogsToView();
            const logsChangedSignalId = settings.connect('changed::uxplay-logs', loadLogsToView);

            window.connect('close-request', () => {
                if (settings && logsChangedSignalId > 0) {
                    settings.disconnect(logsChangedSignalId);
                }
            });
        }
    }
}