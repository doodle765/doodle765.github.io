/* ==========================================================================
   VisionGuide AI — theme.js (new file, safe to add)
   1) Dark / light theme switch (role="switch" toggle in the header).
      Defaults to the OS preference; an explicit choice is stored in
      localStorage and wins over the OS. No third "auto" state: when the
      user has never chosen, the OS is followed live.
   2) Recolors the detection overlay drawn by script.js (cyan boxes) to
      the UI accent. Wraps the canvas style setters after ui.js has run;
      no-ops gracefully if an API is missing.
   Nothing here changes behaviour defined in script.js / ui.js.
   ========================================================================== */
(function () {
    "use strict";

    var STORAGE_KEY = "vg-theme";
    var LIGHT_QUERY = "(prefers-color-scheme: light)";

    var ACCENT = "#22d3ee";
    var ACCENT_FILL = "rgba(34, 211, 238, 0.9)";
    var LABEL_TEXT = "#061018";

    var META_COLORS = {
        dark: "#090b0f",
        light: "#eef1f6"
    };

    function root() {
        return document.documentElement;
    }

    function currentTheme() {
        return root().getAttribute("data-theme") === "light" ? "light" : "dark";
    }

    function applyTheme(theme) {
        root().setAttribute("data-theme", theme);
        var meta = document.getElementById("meta-theme-color");
        if (meta) meta.setAttribute("content", META_COLORS[theme]);

        var toggle = document.getElementById("theme-toggle");
        if (toggle) {
            var dark = theme === "dark";
            toggle.setAttribute("aria-checked", dark ? "true" : "false");
            toggle.setAttribute("aria-label", dark ? "Dark mode" : "Light mode");
        }
    }

    /* 1) Theme toggle ----------------------------------------------- */

    function initToggle() {
        var toggle = document.getElementById("theme-toggle");
        if (!toggle) return;

        var media = null;
        try {
            media = window.matchMedia(LIGHT_QUERY);
        } catch (e) {}

        /* Follow the OS live while the user has made no explicit choice. */
        if (media && media.addEventListener) {
            media.addEventListener("change", function (event) {
                var stored = null;
                try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
                if (!stored) applyTheme(event.matches ? "light" : "dark");
            });
        }

        toggle.addEventListener("click", function () {
            var next = currentTheme() === "dark" ? "light" : "dark";
            applyTheme(next);
            try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
        });

        applyTheme(currentTheme());
    }

    /* 2) Detection overlay recolor ---------------------------------- */

    function remapCanvasColors() {
        var map = {
            "#06b6d4": ACCENT,
            "rgba(6, 182, 212, 0.85)": ACCENT_FILL,
            "#c8102e": ACCENT,
            "rgba(200, 16, 46, 0.92)": ACCENT_FILL,
            "rgba(200, 16, 46, 0.85)": ACCENT_FILL,
            "#000000": LABEL_TEXT,
            "#ffffff": LABEL_TEXT
        };

        try {
            var proto = window.CanvasRenderingContext2D &&
                        window.CanvasRenderingContext2D.prototype;
            if (!proto) return;

            ["strokeStyle", "fillStyle"].forEach(function (prop) {
                var descriptor = Object.getOwnPropertyDescriptor(proto, prop);
                if (!descriptor || !descriptor.set) return;
                var innerSet = descriptor.set;
                Object.defineProperty(proto, prop, {
                    configurable: true,
                    get: descriptor.get,
                    set: function (value) {
                        var key = String(value).toLowerCase();
                        innerSet.call(this, map[key] || value);
                    }
                });
            });
        } catch (err) {
            /* Older engine — leave overlay colors untouched. */
        }
    }

    function init() {
        remapCanvasColors();
        initToggle();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
