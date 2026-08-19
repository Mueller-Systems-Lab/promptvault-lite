// e2e-tests/wdio.conf.linux.release.mjs — WebdriverIO config for Native Tauri E2E
// LINUX RELEASE BINARY variant (demo/site milestone 2026-08-19)
// - Drives the REAL release binary target/release/promptvault-lite (NOT debug,
//   NOT a Vite/browser mock) via tauri-driver + WebKitWebDriver (wry/WebKitGTK).
// - tauri-driver lifecycle managed manually (same pattern as wdio.conf.mjs).
// - WebKitWebDriver resolved from the locally extracted official Ubuntu
//   package: ~/.local/share/webdriver/extract/usr/bin (no system install).
// Run:
//   PATH="$HOME/.local/share/webdriver/extract/usr/bin:$PATH" \
//   XDG_DATA_HOME=/tmp/promptvault-demo-data \
//   DISPLAY=:99 WEBKIT_DISABLE_COMPOSITING_MODE=1 \
//   pnpm exec wdio run e2e-tests/wdio.conf.linux.release.mjs

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_PATH = path.resolve(__dirname, "..", "target", "release", "promptvault-lite");

let tauriDriver;

export const config = {
  hostname: "127.0.0.1",
  port: 4444,
  // tauri-driver unterstützt kein WebDriver-BiDi — webSocketUrl abschalten
  webSocketUrl: false,
  specs: process.env.PVL_DEMO_SPEC
    ? [process.env.PVL_DEMO_SPEC]
    : ["./specs/demo-record.linux.spec.js"],
  capabilities: [
    {
      browserName: "wry",
      // tauri-driver unterstützt kein WebDriver-BiDi — Classic-Protokoll erzwingen
      "wdio:enforceWebDriverClassic": true,
      "tauri:options": {
        application: APP_PATH,
      },
    },
  ],
  maxInstances: 1,
  framework: "mocha",
  reporters: ["spec"],
  connectionRetryTimeout: 300000,
  connectionRetryCount: 1,
  mochaOpts: {
    ui: "bdd",
    timeout: 300000,
  },
  logLevel: "warn",

  onPrepare: () => {
    // Stale Prozesse aus abgebrochenen Läufen entfernen (Port-Konflikte auf
    // 4444/4445 sind die Hauptquelle von Flakiness)
    const stale = spawnSync("bash", [
      "-c",
      "pkill -x tauri-driver 2>/dev/null; pkill -x WebKitWebDriver 2>/dev/null; sleep 1; true",
    ]);
    // Verify release binary exists + is executable
    const check = spawnSync("test", ["-x", APP_PATH]);
    if (check.status !== 0) {
      throw new Error(`Tauri release binary not found or not executable: ${APP_PATH}`);
    }
    // Verify WebKitWebDriver is resolvable
    const wd = spawnSync("bash", ["-c", "command -v WebKitWebDriver"]);
    if (wd.status !== 0) {
      throw new Error(
        "WebKitWebDriver not on PATH. Add ~/.local/share/webdriver/extract/usr/bin",
      );
    }
  },

  beforeSession: async () => {
    tauriDriver = spawn("tauri-driver", [], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    // tauri-driver druckt keine "listening"-Meldung — Port pollieren.
    const net = await import("node:net");
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + 30000;
      const probe = () => {
        const sock = net.connect({ host: "127.0.0.1", port: 4444 });
        sock.on("connect", () => {
          sock.destroy();
          resolve();
        });
        sock.on("error", () => {
          sock.destroy();
          if (Date.now() > deadline) {
            reject(new Error("tauri-driver did not accept connections within 30s"));
            return;
          }
          setTimeout(probe, 500);
        });
      };
      tauriDriver.on("error", (err) => {
        reject(err);
      });
      probe();
    });
  },

  afterSession: () => {
    if (tauriDriver) {
      tauriDriver.kill("SIGTERM");
      tauriDriver = null;
    }
    // Kein verwaister App-Prozess
    const procs = spawnSync("pgrep", ["-f", "target/release/promptvault-lite"], {
      encoding: "utf-8",
    });
    if (procs.status === 0 && procs.stdout && procs.stdout.trim()) {
      console.warn(
        `WARN: verwaiste promptvault-lite-Prozesse nach Session:\n${procs.stdout}`
      );
    }
  },
};
