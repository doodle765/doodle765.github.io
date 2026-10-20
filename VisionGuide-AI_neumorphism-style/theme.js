/* ==========================================================================
   VisionGuide AI — Theme switch (new file, safe to add).
   - Defaults to the OS/system colour scheme.
   - The header switch (role="switch") flips light <-> dark, remembers the
     choice in localStorage, and keeps following the system theme again
     only while no explicit choice has been made.
   - Also remaps the detection-canvas colours drawn by script.js so the
     bounding boxes use the current theme's accent (overrides ui.js's
     earlier remap, which used the old red accent).
   Nothing here changes behaviour defined in script.js; every enhancement
   no-ops gracefully if an element or API is missing.
   ========================================================================== */
(function () {
    "use strict";

    var STORAGE_KEY = "vg-theme";
    var root = document.documentElement;
    var toggle = document.getElementById("theme-toggle");
    var metaThemeColor = document.getElementById("meta-theme-color");

    /* ------------------------------------------------------------------ */
    /* 1) Resolve initial theme: saved choice wins, otherwise the system.  */
    /* ------------------------------------------------------------------ */
    function systemTheme() {
        try {
            return window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light";
        } catch (err) {
            return "light";
        }
    }

    function storedTheme() {
        try {
            var value = window.localStorage.getItem(STORAGE_KEY);
            return value === "dark" || value === "light" ? value : null;
        } catch (err) {
            return null;
        }
    }

    function applyTheme(theme, persist) {
        root.setAttribute("data-theme", theme);

        if (toggle) {
            toggle.setAttribute("aria-checked", theme === "dark" ? "true" : "false");
        }

        if (metaThemeColor) {
            metaThemeColor.setAttribute(
                "content",
                theme === "dark" ? "#1b2130" : "#e4e9f1"
            );
        }

        if (persist) {
            try {
                window.localStorage.setItem(STORAGE_KEY, theme);
            } catch (err) { /* private mode — theme just won't persist */ }
        }

        refreshCanvasAccent();
    }

    /* ------------------------------------------------------------------ */
    /* 2) The switch itself.                                              */
    /* ------------------------------------------------------------------ */
    function bindToggle() {
        if (!toggle) return;

        toggle.addEventListener("click", function () {
            var next =
                root.getAttribute("data-theme") === "dark" ? "light" : "dark";
            applyTheme(next, true);
        });
    }

    /* If the user has not chosen explicitly, keep tracking the OS theme. */
    function watchSystemTheme() {
        var query;
        try {
            query = window.matchMedia("(prefers-color-scheme: dark)");
        } catch (err) {
            return;
        }

        var onChange = function (event) {
            if (!storedTheme()) {
                applyTheme(event.matches ? "dark" : "light", false);
            }
        };

        if (query.addEventListener) {
            query.addEventListener("change", onChange);
        } else if (query.addListener) { /* older engines */
            query.addListener(onChange);
        }
    }

    /* ------------------------------------------------------------------ */
    /* 3) Recolour the detection overlay to the theme accent.
          script.js draws with hard-coded cyan; ui.js already remaps those
          to a legacy red. This wraps that setter again and remaps the red
          to the live --accent token so boxes match light/dark themes.    */
    /* ------------------------------------------------------------------ */
    var canvasAccent = "#4f7cff";

    function refreshCanvasAccent() {
        try {
            var value = window
                .getComputedStyle(root)
                .getPropertyValue("--accent")
                .trim();
            if (value) canvasAccent = value;
        } catch (err) { /* keep last known accent */ }
    }

    function remapCanvasToAccent() {
        var map = {
            "#c8102e": function () { return canvasAccent; },
            "rgba(200, 16, 46, 0.92)": function () {
                return canvasAccent;
            },
            "#ffffff": function () { return "#ffffff"; }
        };

        try {
            var proto = window.CanvasRenderingContext2D &&
                        window.CanvasRenderingContext2D.prototype;
            if (!proto) return;

            ["strokeStyle", "fillStyle"].forEach(function (prop) {
                var descriptor = Object.getOwnPropertyDescriptor(proto, prop);
                if (!descriptor || !descriptor.set) return;
                var previousSet = descriptor.set;
                Object.defineProperty(proto, prop, {
                    configurable: true,
                    get: descriptor.get,
                    set: function (value) {
                        var key = String(value).toLowerCase();
                        var mapped = map[key];
                        previousSet.call(this, mapped ? mapped() : value);
                    }
                });
            });
        } catch (err) {
            /* Older engine — leave overlay colours untouched. */
        }
    }

    /* ------------------------------------------------------------------ */

    function init() {
        applyTheme(storedTheme() || systemTheme(), false);
        bindToggle();
        watchSystemTheme();
        remapCanvasToAccent();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
