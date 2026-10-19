/* ==========================================================================
   VisionGuide AI — theme system (NEW FILE, safe to add)
   --------------------------------------------------------------------------
   • A binary light/dark switch (role="switch") in the header.
   • FIRST VISIT (nothing saved): the site follows the operating system's
     preference (prefers-color-scheme) and keeps following it live.
   • The first time the visitor flips the switch, the choice is saved to
     localStorage and takes over from then on.
   • The resolved theme is applied to <html data-theme="..."> BEFORE the
     first paint (this script is loaded in <head>), so there is no flash
     of the wrong theme. It also keeps <meta name="theme-color"> in sync
     for mobile browser chrome.
   • Everything no-ops gracefully if a browser API is missing.
   ========================================================================== */
(function () {
    "use strict";

    var STORAGE_KEY = "vg-theme";
    var root = document.documentElement;
    var metaThemeColor = document.querySelector('meta[name="theme-color"]');
    var media = null;
    try {
        media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    } catch (err) {
        media = null;
    }

    function storedTheme() {
        try {
            var value = window.localStorage.getItem(STORAGE_KEY);
            return value === "light" || value === "dark" ? value : null;
        } catch (err) {
            return null;
        }
    }

    function saveTheme(theme) {
        try {
            window.localStorage.setItem(STORAGE_KEY, theme);
        } catch (err) { /* private mode etc. — theme still applies, just isn't remembered */ }
    }

    function systemTheme() {
        return media && media.matches ? "dark" : "light";
    }

    /* Keep the header switch in sync with the real state. */
    function updateSwitch(theme) {
        var sw = document.getElementById("theme-toggle");
        if (!sw) return;
        sw.setAttribute("aria-checked", theme === "dark" ? "true" : "false");
    }

    function apply(theme) {
        root.setAttribute("data-theme", theme);
        root.style.colorScheme = theme;
        if (metaThemeColor) {
            metaThemeColor.setAttribute("content", theme === "dark" ? "#0d1218" : "#f4f6f9");
        }
        updateSwitch(theme);
    }

    /* --- Apply before first paint (script runs synchronously in <head>) --- */
    apply(storedTheme() || systemTheme());

    /* Follow the OS live UNTIL the visitor makes an explicit choice. */
    function onSystemChange() {
        if (!storedTheme()) apply(systemTheme());
    }
    if (media) {
        if (media.addEventListener) media.addEventListener("change", onSystemChange);
        else if (media.addListener) media.addListener(onSystemChange); /* older Safari */
    }

    /* --- Bind the switch once the DOM exists --- */
    function bindSwitch() {
        var sw = document.getElementById("theme-toggle");
        if (!sw) return;

        sw.addEventListener("click", function () {
            var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
            saveTheme(next);
            apply(next);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bindSwitch);
    } else {
        bindSwitch();
    }
})();
