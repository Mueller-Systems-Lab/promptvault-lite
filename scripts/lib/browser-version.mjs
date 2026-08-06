// scripts/lib/browser-version.mjs — probe installed Playwright browser versions
// Usage: node scripts/lib/browser-version.mjs <chromium|firefox|webkit>
// Prints {"name":"...","version":"..."} to stdout; exits non-zero on launch failure.

import { chromium, firefox, webkit } from "@playwright/test";

const name = process.argv[2];
const launchers = { chromium, firefox, webkit };

if (!launchers[name]) {
  console.error(`Unknown browser: ${name}`);
  process.exit(2);
}

try {
  const browser = await launchers[name].launch();
  console.log(JSON.stringify({ name, version: browser.version() }));
  await browser.close();
  process.exit(0);
} catch (err) {
  console.error(`Launch failed for ${name}: ${err.message}`);
  process.exit(1);
}
