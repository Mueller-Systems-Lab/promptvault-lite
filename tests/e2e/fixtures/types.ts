/**
 * Shared types for Playwright E2E test fixtures.
 * 100% synthetic, no real data.
 */

export interface PromptItem {
  id: string;
  file_path: string;
  file_name: string;
  title: string;
  description: string;
  category: string;
  version: string;
  tags: string[];
  content: string;
  raw_frontmatter: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  is_favorite: boolean;
}

export interface AnalysisReport {
  evaluations: unknown[];
  hygiene: unknown[];
  total_prompts: number;
  average_score: number;
}
