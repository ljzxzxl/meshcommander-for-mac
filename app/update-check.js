// Injected into every page after DOM load (NW.js "inject_js_end" in package.json).
// Unified update mechanism for the macOS shell:
//   - Help menu gets a "Check for Updates..." item (manual check, always gives
//     feedback through the app's own messagebox dialog, including "up to date").
//   - The upstream "Check for updates" checkbox is kept as the on-startup
//     auto-check switch (state in localStorage['checkForUpdate'], as upstream).
//   - window.NW_AutoUpdateCheck is overridden so both the checkbox and the
//     startup path query this repo's GitHub Releases instead of the long-dead
//     upstream Google Sites endpoint.
//   - Auto check shows a small bottom-right banner; manual check shows a dialog.
// Nothing is downloaded or installed automatically, and no other data is sent.
(function () {
    'use strict';
    if (typeof nw === 'undefined' || typeof require !== 'function') return;

    var REPO = 'ljzxzxl/meshcommander-for-mac';
    var AUTO_DELAY_MS = 10000;
    var isTest = false;
    try { isTest = !!process.env.MESHC_UPDATE_TEST; } catch (e) { }

    function currentVersion() { return isTest ? '0.0.1' : nw.App.manifest.version; }

    function autoCheckEnabled() {
        try { return localStorage.getItem('checkForUpdate') != 'false'; } catch (e) { return true; }
    }

    function cmpVer(a, b) { // > 0 when a is newer than b
        var pa = String(a).replace(/^v/i, '').split('.');
        var pb = String(b).replace(/^v/i, '').split('.');
        for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
            var x = parseInt(pa[i] || '0', 10) || 0, y = parseInt(pb[i] || '0', 10) || 0;
            if (x !== y) return x - y;
        }
        return 0;
    }

    // cb(release) on success, cb(null) on any failure.
    function fetchLatest(cb) {
        try {
            var https = require('https');
            var req = https.get({
                host: 'api.github.com',
                path: '/repos/' + REPO + '/releases/latest',
                headers: { 'User-Agent': 'MeshCommander-for-macOS', 'Accept': 'application/vnd.github+json' },
                timeout: 15000
            }, function (res) {
                if (res.statusCode !== 200) { res.resume(); cb(null); return; }
                var body = '';
                res.on('data', function (d) { body += d; });
                res.on('end', function () {
                    var rel = null;
                    try { rel = JSON.parse(body); } catch (e) { }
                    cb(rel);
                });
            });
            req.on('timeout', function () { req.destroy(); });
            req.on('error', function () { cb(null); });
        } catch (e) { cb(null); }
    }

    function releaseUrl(rel) {
        return (rel && rel.html_url) || ('https://github.com/' + REPO + '/releases/latest');
    }

    function isNewer(rel) {
        return rel && rel.tag_name && !rel.draft && !rel.prerelease && cmpVer(rel.tag_name, currentVersion()) > 0;
    }

    window.MC_OpenDownloadPage = function (url) {
        nw.Shell.openExternal(url || 'https://github.com/' + REPO + '/releases/latest');
        return false;
    };

    // --- Bottom-right banner (used by the automatic startup check) ---
    function showBanner(tag, url) {
        if (document.getElementById('mcUpdateBanner')) return;
        var bar = document.createElement('div');
        bar.id = 'mcUpdateBanner';
        bar.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;' +
            'background:#036;color:#fff;padding:10px 14px;border-radius:6px;' +
            'font-family:Arial,sans-serif;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,.4);' +
            'display:flex;align-items:center;gap:10px;';

        var text = document.createElement('span');
        text.textContent = 'MeshCommander ' + tag + ' is available.';
        bar.appendChild(text);

        var link = document.createElement('a');
        link.textContent = 'Download';
        link.href = '#';
        link.style.cssText = 'color:#9cf;font-weight:bold;text-decoration:underline;cursor:pointer;';
        link.onclick = function (ev) { ev.preventDefault(); window.MC_OpenDownloadPage(url); };
        bar.appendChild(link);

        var close = document.createElement('span');
        close.textContent = '\u00d7';
        close.title = 'Skip this version';
        close.style.cssText = 'cursor:pointer;font-size:16px;line-height:1;padding:0 2px;opacity:.8;';
        close.onclick = function () {
            try { localStorage.setItem('skippedUpdateVersion', tag); } catch (e) { }
            bar.remove();
        };
        bar.appendChild(close);

        document.body.appendChild(bar);
    }

    // --- In-app dialog (used by the manual menu check) ---
    function showDialog(html) {
        try {
            if (typeof window.messagebox === 'function') { window.messagebox('Check for Updates', html); return; }
        } catch (e) { }
        try { alert(html.replace(/<[^>]+>/g, ' ')); } catch (e) { }
    }

    function manualCheck() {
        fetchLatest(function (rel) {
            if (!rel || !rel.tag_name) {
                showDialog('Could not reach GitHub to check for updates.<br />Please check your network connection and try again.');
                return;
            }
            if (!isNewer(rel)) {
                showDialog('You are running the latest version (v' + nw.App.manifest.version + ').');
                return;
            }
            var url = releaseUrl(rel);
            showDialog('A new version of MeshCommander for macOS is available.<br /><br />' +
                'Current version: v' + nw.App.manifest.version + '<br />' +
                'Latest version: ' + rel.tag_name + '<br /><br />' +
                '<a href="#" style="font-weight:bold" onclick="return MC_OpenDownloadPage(\'' + url + '\');">Open download page</a>');
        });
    }

    window.MC_CheckForUpdates = manualCheck;

    // --- Take over the upstream auto-check entry points ---
    // Upstream's NW_CheckForUpdateMenu (checkbox click handler) calls the global
    // NW_AutoUpdateCheck, so overriding it re-points both the checkbox and any
    // startup call at GitHub Releases instead of the dead Google Sites endpoint.
    window.NW_AutoUpdateCheck = function () {
        if (!autoCheckEnabled()) return;
        fetchLatest(function (rel) {
            if (!isNewer(rel)) return;
            var skipped = null;
            try { skipped = localStorage.getItem('skippedUpdateVersion'); } catch (e) { }
            if (skipped === rel.tag_name && !isTest) return;
            showBanner(rel.tag_name, releaseUrl(rel));
        });
    };

    // --- Add the manual "Check for Updates..." item next to the checkbox ---
    function hookMenu() {
        try {
            var win = nw.Window.get();
            if (!win.menu || !window.NW_UpdateMenuItem) return false;
            var items = win.menu.items;
            for (var i = 0; i < items.length; i++) {
                var sub = items[i].submenu;
                if (!sub || !sub.items) continue;
                for (var j = 0; j < sub.items.length; j++) {
                    if (sub.items[j] === window.NW_UpdateMenuItem) {
                        var gui = require('nw.gui');
                        sub.insert(new gui.MenuItem({ label: 'Check for Updates...', click: manualCheck }), j);
                        return true;
                    }
                }
            }
        } catch (e) { }
        return false;
    }
    var hookTries = 0;
    (function tryHook() {
        if (hookMenu() || ++hookTries > 10) return;
        setTimeout(tryHook, 1000);
    })();

    // --- Automatic check shortly after startup (once per session) ---
    var checkedThisSession = false;
    try { checkedThisSession = sessionStorage.getItem('updateChecked') === '1'; } catch (e) { }
    if (!checkedThisSession) {
        setTimeout(function () {
            try { sessionStorage.setItem('updateChecked', '1'); } catch (e) { }
            window.NW_AutoUpdateCheck();
        }, AUTO_DELAY_MS);
    }
})();
