// e2e-tests/wdio.conf.mjs — WebdriverIO config for Native Tauri E2E
// Manages tauri-driver lifecycle manually (no @wdio/tauri-service).
// Run: xvfb-run --auto-servernum pnpm exec wdio run e2e-tests/wdio.conf.mjs

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_PATH = path.resolve(__dirname, "..", "target", "debug", "promptvault-lite");

let tauriDriver;

export const config = {
  hostname: "127.0.0.1",
  port: 4444,
  specs: ["./specs/**/*.js"],
  maxInstances: 1,
  capabilities: [
    {
      browserName: "wry",
      "tauri:options": {
        application: APP_PATH,
      },
    },
  ],
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },
  logLevel: "warn",

  onPrepare: () => {
    // Verify binary exists
    const check = spawnSync("test", ["-x", APP_PATH]);
    if (check.status !== 0) {
      throw new Error(`Tauri binary not found or not executable: ${APP_PATH}`);
    }
  },

  beforeSession: () => {
    tauriDriver = spawn("tauri-driver", [], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("tauri-driver did not start within 30s"));
      }, 30000);
      tauriDriver.stdout.on("data", (data) => {
        if (data.toString().includes("listening")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      tauriDriver.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  },

  afterSession: () => {
    if (tauriDriver) {
      tauriDriver.kill("SIGTERM");
      tauriDriver = null;
    }
  },
};
