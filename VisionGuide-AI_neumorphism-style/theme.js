/* ==========================================================================
   VisionGuide AI — theme manager + small UI polish (new file, safe to add)
   - Dark/light toggle switch. Default follows the system preference; the
     user's choice is remembered in localStorage. The inline script in
     index.html sets the initial theme before first paint to avoid flashing.
   - Updates the <meta name="theme-color"> so the browser chrome matches.
   - Follows live system theme changes while the user has no saved choice.
   - Adds a "Camera is off" placeholder to the viewfinder. Every feature
     no-ops gracefully if an element or API is missing.
   ========================================================================== */
(function () {
    "use strict";

    var root = document.documentElement;
    var STORAGE_KEY = "vg-theme";
    var META_COLORS = { light: "#e7ecf4", dark: "#1b2436" };

    var toggleBtn = document.getElementById("theme-toggle-btn");
    var metaTag = document.getElementById("meta-theme-color");
    var media = window.matchMedia
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;

    function savedTheme() {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch (err) {
            return null;
        }
    }

    function currentTheme() {
        return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    }

    function syncToggle(theme) {
        if (!toggleBtn) return;
        var dark = theme === "dark";
        toggleBtn.setAttribute("aria-checked", String(dark));
        toggleBtn.setAttribute("aria-label", "Dark mode: " + (dark ? "on" : "off"));
        toggleBtn.setAttribute("title", dark ? "Switch to light mode" : "Switch to dark mode");
    }

    function syncMeta(theme) {
        if (metaTag) metaTag.setAttribute("content", META_COLORS[theme]);
    }

    function apply(theme, persist) {
        root.setAttribute("data-theme", theme);
        if (persist) {
            try {
                localStorage.setItem(STORAGE_KEY, theme);
            } catch (err) { /* private mode — theme just won't persist */ }
        }
        syncToggle(theme);
        syncMeta(theme);
    }

    /* Toggle switch */
    if (toggleBtn) {
        toggleBtn.addEventListener("click", function () {
            apply(currentTheme() === "dark" ? "light" : "dark", true);
        });
    }

    /* Keep following the system while the user hasn't chosen explicitly */
    if (media) {
        var onSystemChange = function () {
            if (!savedTheme()) apply(media.matches ? "dark" : "light", false);
        };
        if (media.addEventListener) {
            media.addEventListener("change", onSystemChange);
        } else if (media.addListener) {
            media.addListener(onSystemChange); /* older Safari */
        }
    }

    /* Reflect the initial state on the switch/meta (html attr is already set) */
    syncToggle(currentTheme());
    syncMeta(currentTheme());

    /* "Camera is off" placeholder: srcObject isn't observable, so poll gently */
    var video = document.getElementById("video-feed");
    var viewfinder = document.querySelector(".viewfinder");
    if (video && viewfinder) {
        var syncCameraState = function () {
            viewfinder.classList.toggle("is-off", !video.srcObject);
        };
        syncCameraState();
        window.setInterval(syncCameraState, 600);
    }
})();
