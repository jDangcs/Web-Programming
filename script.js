/*
script.js
Theme switcher for the website.

What it does:
1. Picks a theme: saved choice first, then the visitor's OS setting, else light.
2. Applies it by adding/removing the "night" class on <html>.
styles.css swaps its CSS variables whenever that class is present.
3. Toggles and saves the theme when the button is clicked.
4. Syncs the theme across other open tabs of the site.
*/

(function () {
'use strict';

  var STORAGE_KEY = 'website_theme';          // localStorage key
  var NIGHT_CLASS = 'night';                  // class that enables the alternate theme
  var root = document.documentElement;        // the <html> element

/* localStorage can throw (private browsing, blocked storage), so each
     access is wrapped in try/catch; the page still works without saving. */
function readSavedTheme() {
    try { return localStorage.getItem(STORAGE_KEY); }
    catch (e) { return null; }
}

function saveTheme(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); }
    catch (e) { /* ignore: theme just won't persist */ }
}

  /* Decide which theme to show on load. */
function getInitialTheme() {
    var saved = readSavedTheme();
    if (saved === 'night' || saved === 'light') { return saved; }
    var osPrefersDark = window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
    return osPrefersDark ? 'night' : 'light';
}

/* Apply a theme: set the class, then update the button text and
     aria-pressed (only if the button exists yet). */
function applyTheme(theme) {
    var isNight = theme === 'night';
    root.classList.toggle(NIGHT_CLASS, isNight);

    var button = document.getElementById('theme_toggler');
    if (button) {

        button.setAttribute('aria-pressed', String(isNight));
        button.textContent = isNight ? 'Switch to light theme' : 'Switch to night theme';
    }

}

/* Runs immediately. This script is loaded in <head>, so the class is set
     before the page paints (no flash of the wrong theme). */
applyTheme(getInitialTheme());

  /* Once the HTML has loaded, the button exists, so wire it up. */
document.addEventListener('DOMContentLoaded', function () {
    var theme_toggler = document.getElementById('theme_toggler');

    // Re-apply so the button's label matches the current theme
    applyTheme(root.classList.contains(NIGHT_CLASS) ? 'night' : 'light');

    // On click: flip the theme, then save the new choice
    theme_toggler.addEventListener('click', function () {
        var next = root.classList.contains(NIGHT_CLASS) ? 'light' : 'night';
        applyTheme(next);
        saveTheme(next);
    });
});

/* The "storage" event fires in OTHER tabs when localStorage changes,
     which keeps every open tab on the same theme. */
window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY) { applyTheme(getInitialTheme()); }
    });
})();