/* ==========================================================================
   VisionGuide AI — theme system & Material touch feedback (new file, safe to add)
   - Color theme: first visit follows the OS (prefers-color-scheme); once the
     user picks Light or Dark in the header toggle, that choice persists in
     localStorage ("vg-theme") and wins from then on.
   - A tiny inline script in <head> applies the theme before first paint;
     this file keeps everything in sync afterwards and drives the toggle.
   - Adds a Material-style ink ripple to buttons for touch/click feedback.
   Everything no-ops gracefully if an element or API is missing.
   ========================================================================== */
(function () {
    "use strict";

    var STORAGE_KEY = "vg-theme";
    var media = null;
    try {
        media = window.matchMedia("(prefers-color-scheme: dark)");
    } catch (e) {
        media = null;
    }

    /* null = first visit, no explicit choice yet -> follow the OS */
    function getStored() {
        try {
            var mode = localStorage.getItem(STORAGE_KEY);
            return mode === "light" || mode === "dark" ? mode : null;
        } catch (e) {
            return null;
        }
    }

    function saveMode(mode) {
        try {
            localStorage.setItem(STORAGE_KEY, mode);
        } catch (e) { /* private mode — theme just won't persist */ }
    }

    function resolveDark(stored) {
        if (stored === "dark") return true;
        if (stored === "light") return false;
        return media ? media.matches : false;
    }

    function apply() {
        var stored = getStored();
        var dark = resolveDark(stored);

        document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
        document.documentElement.style.colorScheme = dark ? "dark" : "light";

        var meta = document.getElementById("meta-theme-color");
        if (meta) meta.setAttribute("content", dark ? "#131518" : "#f4f6f8");

        var active = stored || (dark ? "dark" : "light");
        var buttons = document.querySelectorAll(".seg[data-theme-choice]");
        for (var i = 0; i < buttons.length; i++) {
            var isActive = buttons[i].getAttribute("data-theme-choice") === active;
            buttons[i].classList.toggle("is-active", isActive);
            buttons[i].setAttribute("aria-pressed", isActive ? "true" : "false");
        }
    }

    function setMode(mode) {
        saveMode(mode);
        apply();
    }

    /* Toggle wiring (Light / Dark) */
    function bindToggle() {
        var buttons = document.querySelectorAll(".seg[data-theme-choice]");
        for (var i = 0; i < buttons.length; i++) {
            (function (btn) {
                btn.addEventListener("click", function () {
                    setMode(btn.getAttribute("data-theme-choice"));
                });
            })(buttons[i]);
        }
    }

    /* While the user has not chosen yet, keep following the OS live.
       After an explicit choice, the stored mode wins. */
    function bindSystemChanges() {
        if (!media) return;
        var onChange = function () {
            if (getStored() === null) apply();
        };
        if (media.addEventListener) media.addEventListener("change", onChange);
        else if (media.addListener) media.addListener(onChange);
    }

    /* Material ink ripple on press */
    function bindRipples() {
        if (!window.PointerEvent) return;
        var reduced = false;
        try {
            reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        } catch (e) { }
        if (reduced) return;

        document.addEventListener("pointerdown", function (event) {
            var el = event.target.closest
                ? event.target.closest(".button, .icon-button, .seg")
                : null;
            if (!el) return;

            var rect = el.getBoundingClientRect();
            var size = Math.max(rect.width, rect.height) * 2.2;
            var ripple = document.createElement("span");
            ripple.className = "ripple";
            ripple.style.width = ripple.style.height = size + "px";
            ripple.style.left = (event.clientX - rect.left - size / 2) + "px";
            ripple.style.top = (event.clientY - rect.top - size / 2) + "px";
            el.appendChild(ripple);
            window.setTimeout(function () {
                if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
            }, 600);
        });
    }

    function init() {
        apply();
        bindToggle();
        bindSystemChanges();
        bindRipples();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
