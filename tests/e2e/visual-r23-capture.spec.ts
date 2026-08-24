import { test, expect } from "@playwright/test";
import * as fs from "fs";

function buildTauriMockScript(): string {
  return `
    window.__TAURI_INTERNALS__ = (function() {
      function invoke(cmd) {
        switch (cmd) {
          case 'plugin:dialog|open': return Promise.resolve('/mock-vault');
          case 'plugin:dialog|save': return Promise.resolve('/mock-vault/export.json');
          case 'scan_directory': return Promise.resolve([
            {id:'p1',file_path:'/mock-vault/a.md',file_name:'a.md',title:'Test Prompt 1',description:'',category:'general',version:'1.0.0',tags:['test'],content:'# Test\\nInhalt.',raw_frontmatter:{},created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',is_favorite:false}
          ]);
          case 'start_file_watcher': case 'stop_file_watcher': return Promise.resolve(null);
          case 'load_cache': case 'save_cache': return Promise.resolve(null);
          case 'analyze_all': return Promise.resolve({evaluations:[],hygiene:[],total_prompts:1,average_score:0});
          case 'evaluate_prompt': return Promise.resolve({id:'eval-x',prompt_id:'',overall_score:85,criteria:[{name:'Zieldefinition',score:8,max_score:10,weight:0.1,details:'test'}],missing_sections:[],recommendations:[],evaluated_at:new Date().toISOString()});
          case 'analyze_hygiene': return Promise.resolve({id:'hyg-x',prompt_id:'',hygiene_score:100,status:'clean',artifacts:[],analyzed_at:new Date().toISOString()});
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

for (const vp of viewports) {
  test(`capture ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.addInitScript(buildTauriMockScript());
    await page.goto("/", { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(".app-container", { timeout: 15000 });
    await page.waitForTimeout(800);
    const path = `/tmp/opencode/visual-${vp.name}.png`;
    await page.screenshot({ path, fullPage: false });
    console.log(`Captured ${vp.name} -> ${path}`);
    expect(fs.existsSync(path)).toBeTruthy();
  });
}
