// Injected at document-start (NW.js "inject_js_start" in package.json) on every
// page load. Shows a full-screen loading overlay while commander.htm renders,
// then fades it out once the page has finished loading, giving a smooth
// transition before the main UI appears.
(function () {
    'use strict';
    if (window.__mcSplashShown) return;
    window.__mcSplashShown = true;

    var MIN_SHOW_MS = 600;
    var startedAt = Date.now();
    var held = false;
    try { held = !!process.env.MESHC_SPLASH_HOLD; } catch (e) { } // keep visible for verification

    function build() {
        if (document.getElementById('mcSplash')) return;
        var root = document.documentElement;
        if (!root) return;

        var css = document.createElement('style');
        css.id = 'mcSplashStyle';
        css.textContent =
            '#mcSplash{position:fixed;inset:0;z-index:2147483647;display:flex;' +
            'flex-direction:column;align-items:center;justify-content:center;' +
            'background:radial-gradient(circle at 50% 40%,#123049 0%,#0a1622 100%);' +
            'font-family:-apple-system,Helvetica,Arial,sans-serif;' +
            'transition:opacity .45s ease;opacity:1;}' +
            '#mcSplash img{width:96px;height:96px;margin-bottom:18px;' +
            'animation:mcPulse 1.8s ease-in-out infinite;' +
            'filter:drop-shadow(0 4px 14px rgba(0,0,0,.5));}' +
            '#mcSplash .mcTitle{color:#eaf2fb;font-size:20px;font-weight:600;' +
            'letter-spacing:.5px;margin-bottom:22px;}' +
            '#mcSplash .mcSpin{width:30px;height:30px;border-radius:50%;' +
            'border:3px solid rgba(255,255,255,.18);border-top-color:#4aa3ff;' +
            'animation:mcSpin .8s linear infinite;}' +
            '#mcSplash .mcHint{color:#7d97b0;font-size:12px;margin-top:14px;letter-spacing:1px;}' +
            '@keyframes mcSpin{to{transform:rotate(360deg);}}' +
            '@keyframes mcPulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.06);opacity:.85;}}';
        (document.head || root).appendChild(css);

        var box = document.createElement('div');
        box.id = 'mcSplash';
        box.innerHTML =
            '<img src="splash-logo.png" alt="" />' +
            '<div class="mcTitle">MeshCommander</div>' +
            '<div class="mcSpin"></div>' +
            '<div class="mcHint">Loading\u2026</div>';
        root.appendChild(box);
    }

    function hide() {
        if (held) return; // verification hold: leave the splash on screen
        var box = document.getElementById('mcSplash');
        if (!box) return;
        var wait = Math.max(0, MIN_SHOW_MS - (Date.now() - startedAt));
        setTimeout(function () {
            box.style.opacity = '0';
            setTimeout(function () {
                if (box.parentNode) box.parentNode.removeChild(box);
                var st = document.getElementById('mcSplashStyle');
                if (st && st.parentNode) st.parentNode.removeChild(st);
            }, 500);
        }, wait);
    }

    build();
    if (!document.getElementById('mcSplash')) {
        document.addEventListener('DOMContentLoaded', build); // fallback if documentElement wasn't ready
    }
    if (document.readyState === 'complete') { hide(); }
    else { window.addEventListener('load', hide); }
})();
