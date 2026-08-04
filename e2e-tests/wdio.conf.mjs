// e2e-tests/wdio.conf.mjs — WebdriverIO config for Native Tauri E2E
// Uses @wdio/tauri-service for automatic tauri-driver lifecycle.
// Run: npx wdio run e2e-tests/wdio.conf.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_PATH = path.resolve(__dirname, "..", "target", "debug", "promptvault-lite");

export const config = {
  hostname: "127.0.0.1",
  port: 4444,
  specs: ["./e2e-tests/specs/**/*.js"],
  maxInstances: 1,
  capabilities: [
    {
      browserName: "wry",
      "tauri:options": {
        application: APP_PATH,
      },
    },
  ],
  services: ["tauri"],
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },
  // Log level
  logLevel: "warn",
};
