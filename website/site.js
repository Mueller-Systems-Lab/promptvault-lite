/* PromptVault Lite — site.js
   Minimal vanilla JS, no dependencies, no external requests. */

(function () {
  "use strict";

  // No autoplay by default; explicitly disable autoplay for users who
  // prefer reduced motion, even if an autoplay attribute were present.
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.querySelectorAll("video").forEach(function (video) {
      video.autoplay = false;
    });
  }

  // Current year in the footer, if a #year placeholder exists.
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }
})();
