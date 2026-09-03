/**
 * Central place for the extension's branding/links, so every surface (popup, dashboard,
 * in-page panel) pulls from one source instead of duplicating URLs.
 */
const FPM_CONFIG = {
  productName: "My Palette for Flaticon",
  authorName: "Mansoour",
  authorUrl: "https://mansoour.com",
  homepageUrl: "https://mansoour.com/mypalette/",
  privacyUrl: "https://mansoour.com/mypalette/privacy-policy.html",
  contactUrl: "https://mansoour.com/mypalette/contact.html",
  supportEmail: "me@mansoour.com",
  githubUrl: "https://github.com/mansoour/my-palette-for-flaticon",
  copyrightStartYear: 2026,
};

if (typeof window !== "undefined") {
  window.FPM_CONFIG = FPM_CONFIG;
}
if (typeof module !== "undefined") {
  module.exports = FPM_CONFIG;
}
