import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class UXPlayControlPreferences extends ExtensionPreferences {
    constructor(metadata) {
        super(metadata);
    }

    fillPreferencesWindow(window) {
        const isUxPlayAvailable = !!GLib.find_program_in_path('uxplay');
        const settings = this.getSettings();

        if (!settings) {
            const errorPage = new Adw.PreferencesPage({ title: _('Error'), icon_name: 'dialog-error-symbolic' });
            const errorGroup = new Adw.PreferencesGroup();
            errorGroup.add(new Gtk.Label({ label: "Error: Could not load extension settings.", wrap: true, justify: Gtk.Justification.CENTER }));
            errorPage.add(errorGroup);
            window.add(errorPage);
            return;
        }

        try {
            const cssProvider = new Gtk.CssProvider();
            const basePath = (this.metadata && this.metadata.path) ? this.metadata.path : this.path;
            if (basePath) {
                const cssPath = GLib.build_filenamev([basePath, 'stylesheet.css']);
                cssProvider.load_from_file(Gio.File.new_for_path(cssPath));
                Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
            }
        } catch (e) {}

        const getSummary = (key, defaultSubtitle = '') => {
            if (!settings || !settings.settings_schema) return defaultSubtitle;
            const schemaKey = settings.settings_schema.get_key(key);
            if (schemaKey) {
                const summary = schemaKey.get_summary();
                if (summary && summary.length > 0) return summary;
            }
            return defaultSubtitle;
        };

        const addTextRow = (group, title, key, subtitle = '') => {
            const row = new Adw.EntryRow({ title: title, text: settings.get_string(key) });
            if (subtitle) row.set_subtitle(subtitle);
            row.connect('changed', () => settings.set_string(key, row.text));
            group.add(row);
            return row;
        };

        const addSwitchRow = (group, title, key, subtitle = '') => {
            const row = new Adw.SwitchRow({ title: title, subtitle: subtitle || getSummary(key) });
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            group.add(row);
            return row;
        };

        const addComboRow = (group, title, key, options) => {
            const model = new Gtk.StringList();
            options.forEach(opt => model.append(opt));
            const row = new Adw.ComboRow({ title: title, subtitle: getSummary(key), model: model });
            row.set_selected(settings.get_int(key));
            row.connect('notify::selected', () => settings.set_int(key, row.selected));
            group.add(row);
            return row;
        };

        const addDocLink = (page, title, url) => {
            const docGroup = new Adw.PreferencesGroup();
            const docRow = new Adw.ActionRow({ title: title, subtitle: url });
            const linkBtn = new Gtk.LinkButton({ label: _('Open Docs'), uri: url });
            docRow.add_suffix(linkBtn);
            docRow.set_activatable_widget(linkBtn);
            docGroup.add(docRow);
            page.add(docGroup);
        };

        const serverPage = new Adw.PreferencesPage({ title: _('Server & Security'), icon_name: 'network-server-symbolic' });

        const identityGroup = new Adw.PreferencesGroup({ title: _('Server Identity') });
        addTextRow(identityGroup, _('Server Name'), 'server-name');
        addSwitchRow(identityGroup, _('No Hostname Suffix'), 'no-hostname');
        addTextRow(identityGroup, _('MAC Address (Device ID)'), 'mac-address');
        addTextRow(identityGroup, _('BLE Beacon File'), 'ble-beacon');
        serverPage.add(identityGroup);

        const networkGroup = new Adw.PreferencesGroup({ title: _('Network & Ports') });
        addSwitchRow(networkGroup, _('Legacy AirPlay Ports'), 'legacy-ports');
        const customPortsRow = addSwitchRow(networkGroup, _('Use Custom Ports'), 'use-custom-ports');
        const portsRow = addTextRow(networkGroup, _('Port Configuration'), 'port-config');
        customPortsRow.connect('notify::active', () => portsRow.set_sensitive(customPortsRow.active));
        portsRow.set_sensitive(customPortsRow.active);
        serverPage.add(networkGroup);

        const securityGroup = new Adw.PreferencesGroup({ title: _('Security Settings') });
        const secModel = new Gtk.StringList(); [_('None'), _('PIN Code'), _('Password')].forEach(i => secModel.append(i));
        const securityModeRow = new Adw.ComboRow({ title: _('Security Mode'), subtitle: getSummary('security-mode'), model: secModel });
        settings.bind('security-mode', securityModeRow, 'selected', Gio.SettingsBindFlags.DEFAULT);
        securityGroup.add(securityModeRow);

        const pinCodeRow = new Adw.EntryRow({ title: _('PIN Code (4-digit)'), text: settings.get_string('pin-code'), visible: settings.get_int('security-mode') === 1 });
        const passwordRow = new Adw.EntryRow({ title: _('Password'), text: settings.get_string('password'), visible: settings.get_int('security-mode') === 2 });
        securityModeRow.connect('notify::selected', () => {
            pinCodeRow.visible = (securityModeRow.selected === 1);
            passwordRow.visible = (securityModeRow.selected === 2);
        });
        pinCodeRow.connect('changed', entry => {
            const sanitized = entry.get_text().replace(/\D/g, '').substring(0, 4);
            if (entry.get_text() !== sanitized) { entry.set_text(sanitized); entry.set_position(-1); }
            settings.set_string('pin-code', sanitized);
        });
        passwordRow.connect('changed', () => settings.set_string('password', passwordRow.text));
        securityGroup.add(pinCodeRow);
        securityGroup.add(passwordRow);

        addTextRow(securityGroup, _('Client Registry Path'), 'client-registry');
        addTextRow(securityGroup, _('Custom Key Path'), 'custom-key-path');
        serverPage.add(securityGroup);

        const restrictGroup = new Adw.PreferencesGroup({ title: _('Access Control') });
        addSwitchRow(restrictGroup, _('Whitelist Mode (Restrict)'), 'restrict-mode');
        addTextRow(restrictGroup, _('Allowed Devices (CSV)'), 'allowed-devices');
        addTextRow(restrictGroup, _('Blocked Devices (CSV)'), 'blocked-devices');
        addSwitchRow(restrictGroup, _('Drop on New Connection'), 'no-hold');
        addSwitchRow(restrictGroup, _('Clear Frame on Reset'), 'no-freeze');
        serverPage.add(restrictGroup);
        
        addDocLink(serverPage, _('Server and Security Documentation'), 'https://github.com/FDH2/UxPlay#usage');

        const videoPage = new Adw.PreferencesPage({ title: _('Video'), icon_name: 'video-display-symbolic' });

        const displayGroup = new Adw.PreferencesGroup({ title: _('Display Settings') });
        addSwitchRow(displayGroup, _('H265 Support'), 'h265');
        const resOptions = [_('1920x1080@60 (16:9 Desktop)'), _('3840x2160@60 (4K 16:9 Desktop)'), _('1280x720@60 (HD 16:9 Desktop)'), _('1170x2532@60 (iPhone 12/13/14 Pro)'), _('1290x2796@60 (iPhone 14/15 Pro Max)'), _('1080x1920@60 (1080p Portrait)'), _('1920x1440@60 (4:3 iPad)'), _('2732x2048@60 (iPad Pro 12.9")'), _('Custom')];
        const resolutionRow = addComboRow(displayGroup, _('Resolution'), 'resolution-preset', resOptions);
        const customResRow = addTextRow(displayGroup, _('Custom Resolution'), 'custom-resolution');
        customResRow.set_visible(settings.get_int('resolution-preset') === 8);
        resolutionRow.connect('notify::selected', () => customResRow.set_visible(resolutionRow.selected === 8));
        
        const fpsRow = new Adw.SpinRow({ title: _('FPS Limit'), subtitle: _('0 = unlimited'), adjustment: new Gtk.Adjustment({ lower: 0, upper: 240, step_increment: 1, value: settings.get_int('fps-limit') }) });
        fpsRow.connect('notify::value', () => settings.set_int('fps-limit', fpsRow.value));
        displayGroup.add(fpsRow);
        videoPage.add(displayGroup);

        const geomGroup = new Adw.PreferencesGroup({ title: _('Geometry & Windows') });
        addSwitchRow(geomGroup, _('Fullscreen Mode'), 'fullscreen');
        addComboRow(geomGroup, _('Video Flip'), 'video-flip', [_('None'), _('Horizontal'), _('Vertical'), _('Inversion')]);
        addComboRow(geomGroup, _('Video Rotation'), 'video-rotation', [_('None'), _('Right (90°)'), _('Left (-90°)')]);
        addSwitchRow(geomGroup, _('Overscan Mode'), 'overscan');
        addSwitchRow(geomGroup, _('Disable Video (Audio Only)'), 'disable-video');
        addSwitchRow(geomGroup, _('Keep Window Open on Exit'), 'no-close-window');
        addComboRow(geomGroup, _('Screensaver Override'), 'screensaver', [_('Default'), _('On during active mirroring'), _('Always on')]);
        videoPage.add(geomGroup);

        addDocLink(videoPage, _('Video Documentation'), 'https://github.com/FDH2/UxPlay#video-and-audio-options');

        const audioPage = new Adw.PreferencesPage({ title: _('Audio & HLS'), icon_name: 'audio-volume-high-symbolic' });

        const audioSyncGroup = new Adw.PreferencesGroup({ title: _('Audio Synchronization') });
        addSwitchRow(audioSyncGroup, _('Video Sync'), 'vsync');
        addSwitchRow(audioSyncGroup, _('Async Audio (Audio-only)'), 'async-audio');
        const latencyRow = new Adw.SpinRow({ title: _('Audio Latency'), digits: 2, adjustment: new Gtk.Adjustment({ lower: 0.0, upper: 2.0, step_increment: 0.05 }) });
        settings.bind('audio-latency', latencyRow.get_adjustment(), 'value', Gio.SettingsBindFlags.DEFAULT);
        audioSyncGroup.add(latencyRow);
        audioPage.add(audioSyncGroup);

        const volumeGroup = new Adw.PreferencesGroup({ title: _('Volume Control') });
        const volumeRow = new Adw.SpinRow({ title: _('Volume Multiplier'), subtitle: _('Does not affect source device volume'), digits: 1, adjustment: new Gtk.Adjustment({ lower: 0.0, upper: 1.0, step_increment: 0.1 }) });
        settings.bind('initial-volume', volumeRow.get_adjustment(), 'value', Gio.SettingsBindFlags.DEFAULT);
        volumeGroup.add(volumeRow);
        addTextRow(volumeGroup, _('Decibel Limits (l:h)'), 'db-limits');
        addSwitchRow(volumeGroup, _('Logarithmic Taper'), 'taper-volume');
        audioPage.add(volumeGroup);

        const metaGroup = new Adw.PreferencesGroup({ title: _('Metadata Extraction') });
        addTextRow(metaGroup, _('Cover Art Dump Path'), 'cover-art-path');
        addTextRow(metaGroup, _('Metadata Dump Path'), 'metadata-path');
        addTextRow(metaGroup, _('DACP Telemetry Path'), 'dacp-path');
        audioPage.add(metaGroup);

        const hlsGroup = new Adw.PreferencesGroup({ title: _('HTTP Live Streaming (HLS)') });
        addSwitchRow(hlsGroup, _('Enable HLS Interception'), 'hls-support');
        addTextRow(hlsGroup, _('Language Code'), 'hls-lang');
        audioPage.add(hlsGroup);

        addDocLink(audioPage, _('Audio and HLS Documentation'), 'https://github.com/FDH2/UxPlay#video-and-audio-options');

        const advancedPage = new Adw.PreferencesPage({ title: _('Advanced'), icon_name: 'preferences-other-symbolic' });

        const configInfoGroup = new Adw.PreferencesGroup({
            title: _('Configuration File'),
            description: _('UXPlay Control stores runtime settings in a dedicated file.\nPath: ~/.config/uxplay-control/uxplayrc\nChanges made here are automatically synced to this file.')
        });
        advancedPage.add(configInfoGroup);

        const gstGroup = new Adw.PreferencesGroup({ title: _('GStreamer Pipeline') });
        addTextRow(gstGroup, _('Parser Element'), 'gst-parser');
        addTextRow(gstGroup, _('Decoder Element'), 'gst-decoder');
        addTextRow(gstGroup, _('Converter Element'), 'gst-converter');
        addTextRow(gstGroup, _('Video Sink'), 'gst-video-sink');
        addTextRow(gstGroup, _('Audio Sink'), 'gst-audio-sink');
        addSwitchRow(gstGroup, _('Force SW Decode'), 'force-sw-decode');
        addSwitchRow(gstGroup, _('Prioritize Video4Linux2'), 'force-v4l2');
        addComboRow(gstGroup, _('Color Space Matrix'), 'color-space', [_('Auto'), _('BT.709'), _('sRGB')]);
        advancedPage.add(gstGroup);

        const exportGroup = new Adw.PreferencesGroup({ title: _('Stream Exports & Muxing') });
        addTextRow(exportGroup, _('RTP Video Pipeline'), 'vrtp-pipeline');
        addTextRow(exportGroup, _('RTP Audio Pipeline'), 'artp-pipeline');
        addTextRow(exportGroup, _('Encode to MP4'), 'mp4-path');
        advancedPage.add(exportGroup);

        const diagGroup = new Adw.PreferencesGroup({ title: _('Diagnostics & Timeouts') });
        addSwitchRow(diagGroup, _('Print FPS Telemetry'), 'fps-data');
        addTextRow(diagGroup, _('Video Dump Path'), 'video-dump-path');
        addTextRow(diagGroup, _('Audio Dump Path'), 'audio-dump-path');
        const resetRow = new Adw.SpinRow({ title: _('Reset Timeout'), adjustment: new Gtk.Adjustment({ lower: 0, upper: 300, step_increment: 5, value: settings.get_int('reset-timeout') }) });
        resetRow.connect('notify::value', () => settings.set_int('reset-timeout', resetRow.value));
        diagGroup.add(resetRow);
        addSwitchRow(diagGroup, _('Debug Logging'), 'debug');
        advancedPage.add(diagGroup);

        addDocLink(advancedPage, _('Advanced Documentation'), 'https://github.com/FDH2/UxPlay#usage');

        const logsPage = new Adw.PreferencesPage({ title: _('Logs'), icon_name: 'document-properties-symbolic' });
        const logDisplayGroup = new Adw.PreferencesGroup({ title: _('Application Logs') });
        const logTextView = new Gtk.TextView({ editable: false, cursor_visible: false, wrap_mode: Gtk.WrapMode.WORD_CHAR, vexpand: true, hexpand: true });
        const logScrolledWindow = new Gtk.ScrolledWindow({ child: logTextView, hscrollbar_policy: Gtk.PolicyType.AUTOMATIC, vscrollbar_policy: Gtk.PolicyType.AUTOMATIC, min_content_height: 200 });
        logDisplayGroup.add(logScrolledWindow);
        logsPage.add(logDisplayGroup);

        const logControlsGroup = new Adw.PreferencesGroup({ title: _('Log Management') });
        const maxLogLinesRow = new Adw.SpinRow({ title: _('Maximum Log Lines'), adjustment: new Gtk.Adjustment({ lower: 100, upper: 50000, step_increment: 100, value: settings.get_int('max-log-lines') }), digits: 0 });
        maxLogLinesRow.connect('notify::value', () => settings.set_int('max-log-lines', maxLogLinesRow.value));
        logControlsGroup.add(maxLogLinesRow);

        const clearLogsActionRow = new Adw.ActionRow({ title: _('Clear All Stored Logs') });
        const clearButtonForAction = new Gtk.Button({ label: _('Clear') });
        clearButtonForAction.connect('clicked', () => settings.set_strv('uxplay-logs', []));
        clearLogsActionRow.add_suffix(clearButtonForAction);
        clearLogsActionRow.set_activatable_widget(clearButtonForAction);
        logControlsGroup.add(clearLogsActionRow);
        logsPage.add(logControlsGroup);

        const aboutPage = new Adw.PreferencesPage({ title: _('About'), icon_name: 'help-about-symbolic' });

        const extensionGroup = new Adw.PreferencesGroup({ title: _('Extension Information') });
        const md = this.metadata || {};
        extensionGroup.add(new Adw.ActionRow({ title: _('Name'), subtitle: md.name || 'N/A' }));
        extensionGroup.add(new Adw.ActionRow({ title: _('Description'), subtitle: md.description || 'N/A' }));
        extensionGroup.add(new Adw.ActionRow({ title: _('Version'), subtitle: String(md.version ?? 'N/A') }));
        extensionGroup.add(new Adw.ActionRow({ title: _('UUID'), subtitle: md.uuid || 'N/A' }));
        extensionGroup.add(new Adw.ActionRow({ title: _('Supported GNOME Versions'), subtitle: Array.isArray(md['shell-version']) ? md['shell-version'].join(', ') : 'N/A' }));

        if (md.url) {
            const homepageRow = new Adw.ActionRow({ title: _('Homepage'), subtitle: md.url });
            const linkBtn = new Gtk.LinkButton({ label: _('Open'), uri: md.url });
            homepageRow.add_suffix(linkBtn);
            homepageRow.set_activatable_widget(linkBtn);
            extensionGroup.add(homepageRow);
        }

        const developerGroup = new Adw.PreferencesGroup({ title: _('Developer Information') });
        const avatar = new Adw.Avatar({ size: 100, text: 'X', halign: Gtk.Align.CENTER });
        avatar.add_css_class('about-avatar');

        const resourceBundlePath = GLib.build_filenamev([(this.metadata && this.metadata.path) ? this.metadata.path : this.path, 'resources.gresource']);
        try {
            Gio.resources_register(Gio.Resource.load(resourceBundlePath));
        } catch (e) {}

        try {
            const resourcePath = '/org/gnome/shell/extensions/uxplay-control/icons/ava.png';
            const stream = Gio.resources_open_stream(resourcePath, Gio.ResourceLookupFlags.NONE);
            if (stream) {
                const pixbuf = GdkPixbuf.Pixbuf.new_from_stream_at_scale(stream, 100, 100, true, null);
                avatar.set_custom_image(Gdk.Texture.new_for_pixbuf(pixbuf));
            }
        } catch (e) {}

        const nicknameLabel = new Gtk.Label({ label: _('xxanqw'), halign: Gtk.Align.CENTER });
        nicknameLabel.add_css_class('title-3');
        nicknameLabel.add_css_class('about-nickname');

        const devDescLabel = new Gtk.Label({ label: _('smol ukrainian dev🤫'), halign: Gtk.Align.CENTER, wrap: true });
        devDescLabel.add_css_class('dim-label');

        const buttonsBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 10, halign: Gtk.Align.CENTER, css_classes: ['about-buttons'] });
        const paypalLabel = new Gtk.Label({ label: _('PayPal: travix10x@icloud.com'), css_classes: ['about-button'], selectable: true });
        
        const bankButton = new Gtk.Button({ label: _('Support via Bank'), css_classes: ['about-button'] });
        bankButton.connect('clicked', () => { try { Gio.AppInfo.launch_default_for_uri('https://xxanqw.pp.ua/donate', null); } catch (e) {} });

        const projectButton = new Gtk.Button({ label: _('Project GitHub'), css_classes: ['about-button'] });
        projectButton.connect('clicked', () => { try { Gio.AppInfo.launch_default_for_uri('https://xxanqw.pp.ua/uxpc', null); } catch (e) {} });

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
            const errorPage = new Adw.PreferencesPage({ title: _('UXPlay Not Found'), icon_name: 'dialog-error-symbolic' });
            const errorGroup = new Adw.PreferencesGroup();
            errorGroup.add(new Adw.StatusPage({
                title: _('UXPlay Not Found'),
                description: _("UXPlay is not installed or not in your system's PATH.\n\nPlease install it and restart GNOME Shell for the extension to work."),
                icon_name: 'dialog-error-symbolic',
                vexpand: true,
            }));
            errorPage.add(errorGroup);
            window.add(errorPage);

            serverPage.set_sensitive(false);
            videoPage.set_sensitive(false);
            audioPage.set_sensitive(false);
            advancedPage.set_sensitive(false);
            logsPage.set_sensitive(false);
        }

        window.add(serverPage);
        window.add(videoPage);
        window.add(audioPage);
        window.add(advancedPage);
        window.add(logsPage);
        window.add(aboutPage);

        const loadLogsToView = () => {
            if (!logTextView || !settings) return;
            const logs = settings.get_strv('uxplay-logs');
            logTextView.get_buffer().set_text(logs.join('\n'), -1);
            if (logScrolledWindow) {
                const adj = logScrolledWindow.get_vadjustment();
                if (adj) {
                    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                        adj.set_value(adj.get_upper() > adj.get_page_size() ? adj.get_upper() - adj.get_page_size() : 0);
                        return GLib.SOURCE_REMOVE;
                    });
                }
            }
        };

        if (isUxPlayAvailable) {
            loadLogsToView();
            const logsChangedSignalId = settings.connect('changed::uxplay-logs', loadLogsToView);
            window.connect('close-request', () => {
                if (settings && logsChangedSignalId > 0) settings.disconnect(logsChangedSignalId);
            });
        }
    }
}
