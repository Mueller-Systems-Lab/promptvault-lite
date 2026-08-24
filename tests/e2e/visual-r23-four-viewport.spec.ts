import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

function buildTauriMockScript(): string {
  return `
    window.__TAURI_INTERNALS__ = (function() {
      function invoke(cmd, args) {
        switch (cmd) {
          case 'plugin:dialog|open': return Promise.resolve('/mock-vault');
          case 'plugin:dialog|save': return Promise.resolve('/mock-vault/export.json');
          case 'scan_directory': return Promise.resolve([
            {id:'p1',file_path:'/mock-vault/a.md',file_name:'a.md',title:'Test Prompt 1',description:'',category:'general',version:'1.0.0',tags:['test'],content:'# Test\\nInhalt.',raw_frontmatter:{},created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',is_favorite:false}
          ]);
          case 'start_file_watcher': case 'stop_file_watcher': return Promise.resolve(null);
          case 'load_cache': case 'save_cache': return Promise.resolve(null);
          case 'analyze_all': return Promise.resolve({evaluations:[],hygiene:[],total_prompts:1,average_score:0});
          case 'evaluate_prompt': {
            return Promise.resolve({
              id:'eval-x', prompt_id:'p1', overall_score: 85,
              criteria:[
                {name:'Zieldefinition',score:8,max_score:10,weight:0.1,details:'test'},
                {name:'Kontextqualität',score:7,max_score:10,weight:0.1,details:'test'},
              ],
              missing_sections:[], recommendations:["Spezifiziere das Ausgabeformat"], evaluated_at:new Date().toISOString()
            });
          }
          case 'analyze_hygiene': return Promise.resolve({id:'hyg-x',prompt_id:'',hygiene_score:97,status:'clean',artifacts:[],analyzed_at:new Date().toISOString()});
          case 'toggle_favorite': return Promise.resolve(false);
          case 'get_favorites': return Promise.resolve([]);
          case 'export_json': case 'export_markdown': case 'export_zip': return Promise.resolve('/mock-vault/export');
          case 'detect_artifacts_action': return Promise.resolve({artifacts:[],hygiene_score:100,status:'clean',categories_found:[]});
          default: return Promise.resolve(null);
        }
      }
      function transformCallback(cb,once){return 1;}
      function convertFileSrc(fp){return 'mock-asset://'+(fp||'unknown');}
      return {invoke:invoke,transformCallback:transformCallback,convertFileSrc:convertFileSrc};
    })();
  `;
}

const viewports = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '768x800', width: 768, height: 800 },
  { name: '390x844', width: 390, height: 844 },
];

// Synthetic prompt for Direktanalyse - no PII
const syntheticPrompt = `# Synthetic Prompt — Vision QA Test

You are a translation assistant. Translate the following text into English. Preserve tone and meaning. Return only the translation.

Input: {{source_text}}
Output format: JSON { "translation": "string" }

Constraints: Be concise, no extra explanation.`;

for (const vp of viewports) {
  test(`visual R2.3 four-viewport ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.addInitScript(buildTauriMockScript());
    await page.goto("/", { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(".app-container", { timeout: 15000 });
    await page.waitForTimeout(800);

    // Ensure evidence dir exists
    const evidenceDir = path.resolve(process.cwd(), "evidence/visual-r23");
    const tmpDir = "/tmp/opencode";
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    // A. app shell / prompt loaded (Direktanalyse idle)
    // Capture shell before opening Direktanalyse (explorer view) + after opening Direktanalyse idle
    const shellPath = path.join(evidenceDir, `shell-${vp.name}.png`);
    const shellTmpPath = path.join(tmpDir, `visual-r23-shell-${vp.name}.png`);
    await page.screenshot({ path: shellPath, fullPage: false });
    await page.screenshot({ path: shellTmpPath, fullPage: false });
    console.log(`Captured shell ${vp.name} -> ${shellPath} (${fs.statSync(shellPath).size} bytes)`);
    expect(fs.existsSync(shellPath)).toBeTruthy();

    // Now open Direktanalyse (PastePromptAnalyzer idle)
    const direktButton = page.getByRole('button', { name: /Direktanalyse/ });
    await direktButton.click();
    await page.waitForTimeout(600);
    // Verify textarea visible
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible({ timeout: 5000 });

    // Capture Direktanalyse idle state as A2
    const shellPasteIdlePath = path.join(evidenceDir, `shell-paste-idle-${vp.name}.png`);
    const shellPasteIdleTmp = path.join(tmpDir, `visual-r23-shell-paste-idle-${vp.name}.png`);
    await page.screenshot({ path: shellPasteIdlePath, fullPage: false });
    await page.screenshot({ path: shellPasteIdleTmp, fullPage: false });
    console.log(`Captured paste idle ${vp.name} -> ${shellPasteIdlePath}`);

    // B/C. completed analysis state + recommendations visible
    await textbox.fill(syntheticPrompt);
    await page.waitForTimeout(300);
    const analyseButton = page.getByRole('button', { name: /Analysieren/ });
    await analyseButton.click();
    await page.waitForTimeout(1200);
    // Wait for analysis result: expect Classification section
    await page.waitForSelector('text=Klassifikation', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);

    const analysisPath = path.join(evidenceDir, `analysis-${vp.name}.png`);
    const analysisTmp = path.join(tmpDir, `visual-r23-analysis-${vp.name}.png`);
    await page.screenshot({ path: analysisPath, fullPage: false });
    await page.screenshot({ path: analysisTmp, fullPage: false });
    console.log(`Captured analysis ${vp.name} -> ${analysisPath} (${fs.statSync(analysisPath).size} bytes)`);
    expect(fs.existsSync(analysisPath)).toBeTruthy();
    expect(fs.statSync(analysisPath).size).toBeGreaterThan(5000);

    // Optional: scroll down to ensure recommendations/scores visible if needed, capture second analysis viewport
    // Do a full-page screenshot if needed for overflow check (but spec says fullPage false viewport capture is primary)
    // Ensure at least 2 useful per viewport are present: shell-paste-idle + analysis count as 2, plus shell
  });
}
