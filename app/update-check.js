// Injected into every page after DOM load (NW.js "inject_js_end" in package.json).
// Notification-style update check, same closed loop as ChargeLimiter: query
// GitHub Releases for the latest version and, when it is newer than the
// running app, show a small banner linking to the release page. The user
// downloads and replaces the app manually - no auto-download, no telemetry.
(function () {
    'use strict';
    var REPO = 'ljzxzxl/meshcommander-for-mac';
    var CHECK_DELAY_MS = 10000;

    // The language menu reloads the page (commander_*.htm), so remember that
    // this session already checked to avoid hitting the API on every switch.
    if (typeof nw === 'undefined' || typeof require !== 'function') return;
    try { if (sessionStorage.getItem('updateChecked') === '1') return; } catch (e) { }

    function cmpVer(a, b) { // > 0 when a is newer than b
        var pa = String(a).replace(/^v/i, '').split('.');
        var pb = String(b).replace(/^v/i, '').split('.');
        for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
            var x = parseInt(pa[i] || '0', 10) || 0, y = parseInt(pb[i] || '0', 10) || 0;
            if (x !== y) return x - y;
        }
        return 0;
    }

    function fetchLatest(cb) {
        try {
            var https = require('https');
            var req = https.get({
                host: 'api.github.com',
                path: '/repos/' + REPO + '/releases/latest',
                headers: { 'User-Agent': 'MeshCommander-for-macOS', 'Accept': 'application/vnd.github+json' },
                timeout: 15000
            }, function (res) {
                if (res.statusCode !== 200) { res.resume(); return; }
                var body = '';
                res.on('data', function (d) { body += d; });
                res.on('end', function () {
                    try { cb(JSON.parse(body)); } catch (e) { }
                });
            });
            req.on('timeout', function () { req.destroy(); });
            req.on('error', function () { });
        } catch (e) { }
    }

    function showBanner(tag, url) {
        var bar = document.createElement('div');
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
        link.onclick = function (ev) { ev.preventDefault(); nw.Shell.openExternal(url); };
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

    setTimeout(function () {
        var current = nw.App.manifest.version;
        try { if (process.env.MESHC_UPDATE_TEST) current = '0.0.1'; } catch (e) { }
        fetchLatest(function (rel) {
            try { sessionStorage.setItem('updateChecked', '1'); } catch (e) { }
            if (!rel || !rel.tag_name || rel.draft || rel.prerelease) return;
            if (cmpVer(rel.tag_name, current) <= 0) return;
            var skipped = null;
            try { skipped = localStorage.getItem('skippedUpdateVersion'); } catch (e) { }
            if (skipped === rel.tag_name && !process.env.MESHC_UPDATE_TEST) return;
            showBanner(rel.tag_name, rel.html_url || ('https://github.com/' + REPO + '/releases/latest'));
        });
    }, CHECK_DELAY_MS);
})();
