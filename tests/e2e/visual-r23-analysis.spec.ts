import { test, expect } from "@playwright/test";
import * as fs from "fs";

function buildTauriMockScript(): string {
  return `
    window.__TAURI_INTERNALS__ = (function() {
      function invoke(cmd, args) {
        console.log('invoke', cmd, args);
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
            const content = args && args.content ? args.content : '';
            // Return a mock evaluation with recommendations
            return Promise.resolve({
              id:'eval-x',
              prompt_id:'p1',
              overall_score: 85,
              criteria:[
                {name:'Zieldefinition',score:8,max_score:10,weight:0.1,details:'test'},
                {name:'Kontextqualität',score:7,max_score:10,weight:0.1,details:'test'},
                {name:'Eingabendefinition',score:9,max_score:10,weight:0.1,details:'test'},
                {name:'Vorgehensbeschreibung',score:8,max_score:10,weight:0.1,details:'test'},
                {name:'Ausgabeformat',score:9,max_score:10,weight:0.1,details:'test'},
                {name:'Qualitätsanforderungen',score:7,max_score:10,weight:0.1,details:'test'},
                {name:'Sicherheitsgrenzen',score:8,max_score:10,weight:0.1,details:'test'},
                {name:'Klarheit',score:9,max_score:10,weight:0.1,details:'test'},
                {name:'Wiederverwendbarkeit',score:8,max_score:10,weight:0.1,details:'test'},
                {name:'Rollendefinition',score:2,max_score:10,weight:0,details:'test'}
              ],
              missing_sections:[],
              recommendations:["Spezifiziere das Ausgabeformat: Antworte im JSON-Format"],
              evaluated_at:new Date().toISOString()
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

test("capture analysis result 1280x720", async ({ page }) => {
  await page.addInitScript(buildTauriMockScript());
  await page.goto("/");
  await page.waitForSelector(".app-container", { timeout: 15000 });
  // Open Direktanalyse
  const direktButton = page.getByRole('button', { name: /Direktanalyse/ });
  await direktButton.click();
  await page.waitForTimeout(500);
  const textbox = page.getByRole('textbox');
  await textbox.fill('Translate the following text into English. Preserve tone and meaning. Return only the translation:\n\n{{source_text}}');
  const analyseButton = page.getByRole('button', { name: /Analysieren/ });
  await analyseButton.click();
  await page.waitForTimeout(1500);
  // Wait for analysis result
  await page.waitForSelector('text=Zieldefinition', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
  const path = `/tmp/opencode/visual-analysis-1280x720.png`;
  await page.screenshot({ path, fullPage: false });
  console.log(`Captured analysis -> ${path}`);
  expect(fs.existsSync(path)).toBeTruthy();
});
