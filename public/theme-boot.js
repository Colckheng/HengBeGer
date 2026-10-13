// Theme boot script.
//
// This used to be an inline <script> in index.html, which the production
// Content Security Policy (helmet's default `script-src 'self'`) refuses to
// execute. Keeping it external preserves the original behaviour: the stored
// light/dark choice is applied before the first paint, so a dark-theme reader
// never sees a light flash.
try {
  var stored = localStorage.getItem('hb-theme');
  document.documentElement.dataset.theme =
    stored === 'dark' || stored === 'light' ? stored : 'light';
} catch (error) {
  document.documentElement.dataset.theme = 'light';
}
