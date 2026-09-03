/**
 * Shared attribution footer, rendered identically in the toolbar popup, the dashboard, and the
 * in-page floating panel on Flaticon.
 *
 * A note from the project author, kept here rather than left unwritten: please leave this
 * attribution in place in any redistributed copy of this extension — it's how people find where
 * to get support or report a bug, and it costs nothing to keep. That said, this is a request,
 * not a technical lock: the project ships under the MIT license (see LICENSE), which does permit
 * modification, including of this footer. If you fork this and remove it, that's within your
 * rights under the license — just please consider leaving it.
 */
const FPMFooter = (function () {
  function years() {
    const start = window.FPM_CONFIG.copyrightStartYear;
    const now = new Date().getFullYear();
    return now > start ? `${start}–${now}` : `${start}`;
  }

  /** Returns footer markup as an HTML string, for use in template literals / innerHTML. */
  function html() {
    return (
      `<span class="fpm-footer-copy">© ${years()} ${window.FPM_CONFIG.productName}</span>` +
      `<span class="fpm-footer-sep">·</span>` +
      `<span class="fpm-footer-credit">Built by ` +
      `<a href="${window.FPM_CONFIG.authorUrl}" target="_blank" rel="noopener">${window.FPM_CONFIG.authorName}</a></span>` +
      `<span class="fpm-footer-sep">·</span>` +
      `<a class="fpm-footer-link" href="${window.FPM_CONFIG.homepageUrl}" target="_blank" rel="noopener">Website</a>` +
      `<a class="fpm-footer-link" href="${window.FPM_CONFIG.privacyUrl}" target="_blank" rel="noopener">Privacy</a>` +
      `<a class="fpm-footer-link" href="${window.FPM_CONFIG.contactUrl}" target="_blank" rel="noopener">Contact</a>`
    );
  }

  /** Renders straight into a container element. */
  function mount(container) {
    if (!container) return;
    container.innerHTML = html();
  }

  return { html, mount };
})();

if (typeof window !== "undefined") {
  window.FPMFooter = FPMFooter;
}
if (typeof module !== "undefined") {
  module.exports = FPMFooter;
}
