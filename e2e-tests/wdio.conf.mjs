// e2e-tests/wdio.conf.mjs — WebdriverIO config for Native Tauri E2E
// Manages tauri-driver lifecycle manually (no @wdio/tauri-service).
// Run: xvfb-run --auto-servernum pnpm exec wdio run e2e-tests/wdio.conf.mjs
//
// E19 Gate Contract (Run Card §22):
//   - kein verwaister App-Prozess nach dem Lauf
//   - tauri-driver wird sauber beendet

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_PATH = path.resolve(__dirname, "..", "target", "debug", "promptvault-lite");

let tauriDriver;

export const config = {
  hostname: "127.0.0.1",
  port: 4444,
  // tauri-driver unterstützt kein WebDriver-BiDi — webSocketUrl abschalten
  webSocketUrl: false,
  specs: ["./specs/**/*.js"],
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
    // Verify binary exists
    const check = spawnSync("test", ["-x", APP_PATH]);
    if (check.status !== 0) {
      throw new Error(`Tauri binary not found or not executable: ${APP_PATH}`);
    }
    // Verify python3 + python-xlib for the native dialog helper
    const py = spawnSync("python3", ["-c", "import Xlib; print('ok')"]);
    if (py.status !== 0) {
      throw new Error("python3 + python-xlib required for E19 native dialog helper");
    }
  },

  beforeSession: async () => {
    tauriDriver = spawn("tauri-driver", [], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    // tauri-driver druckt in neueren Versionen keine "listening"-Meldung —
    // stattdessen den Port pollieren, bis er Verbindungen annimmt.
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
    // Kein verwaister App-Prozess (Run Card §22)
    const procs = spawnSync("pgrep", ["-f", "target/debug/promptvault-lite"], { encoding: "utf-8" });
    if (procs.status === 0 && procs.stdout && procs.stdout.trim()) {
      // App wurde nicht beendet — diagnostizieren, nicht killen (Owner-Entscheidung)
      console.warn(
        `WARN: verwaiste promptvault-lite-Prozesse nach Session:\n${procs.stdout}`
      );
    }
  },
};
