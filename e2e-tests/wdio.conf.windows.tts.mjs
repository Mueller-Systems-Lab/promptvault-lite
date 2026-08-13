// e2e-tests/wdio.conf.windows.tts.mjs — Native Tauri E2E (Windows) for the
// local neural TTS (Piper) proof. Mirrors wdio.conf.windows.mjs but targets
// the TTS spec. The runtime chain requires a real local `piper` executable on
// PATH and the German ONNX model at the application data directory.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_PATH = path.resolve(__dirname, "..", "target", "debug", "promptvault-lite.exe");
const TAURI_DRIVER = path.join(os.homedir(), ".cargo", "bin", "tauri-driver.exe");

let tauriDriver;

function discoverMsedgedriver() {
  const cacheRoot = path.join(os.homedir(), ".wdio-msedgedriver");
  if (!fs.existsSync(cacheRoot)) return null;
  const versions = fs
    .readdirSync(cacheRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();
  for (const v of versions) {
    const exe = path.join(cacheRoot, v, "msedgedriver.exe");
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}

export const config = {
  hostname: "127.0.0.1",
  port: 4444,
  webSocketUrl: false,
  specs: ["./specs/local-tts-piper.native.spec.js"],
  capabilities: [
    {
      browserName: "wry",
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
    timeout: 900000,
  },
  logLevel: "warn",

  onPrepare: () => {
    if (!fs.existsSync(APP_PATH)) {
      throw new Error(`Tauri binary not found: ${APP_PATH}`);
    }
    if (!fs.existsSync(TAURI_DRIVER)) {
      throw new Error(`tauri-driver not found: ${TAURI_DRIVER} (run: cargo install tauri-driver)`);
    }
    const msedgedriver = discoverMsedgedriver();
    if (!msedgedriver) {
      throw new Error(
        "msedgedriver not found under ~/.wdio-msedgedriver. Download it from " +
          "https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver/ " +
          "matching the installed WebView2 runtime major version.",
      );
    }
    process.env.PATH = `${path.dirname(msedgedriver)}${path.delimiter}${process.env.PATH || ""}`;
    console.log(`[windows-native-tts] app binary: ${APP_PATH}`);
    console.log(`[windows-native-tts] msedgedriver: ${msedgedriver}`);
  },

  beforeSession: async () => {
    tauriDriver = spawn(TAURI_DRIVER, [], {
      stdio: ["ignore", "pipe", "pipe"],
    });
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
      tauriDriver.on("error", (err) => reject(err));
      probe();
    });
  },

  afterSession: () => {
    if (tauriDriver) {
      tauriDriver.kill("SIGTERM");
      tauriDriver = null;
    }
  },
};
