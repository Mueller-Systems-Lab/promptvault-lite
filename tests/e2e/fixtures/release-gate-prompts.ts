/**
 * Visual Release Gate — Synthetic Prompt Fixtures
 *
 * Five deterministic, synthetic prompt fixtures used as test input
 * for the visual release gate Playwright E2E tests.
 *
 * ## Privacy Constraints
 *  - 100% synthetic content
 *  - No real filenames, paths, secrets, or private data
 *  - No references to real projects, repositories, or people
 *  - Safe to commit
 *
 * ## Fixture Types
 *  1. STANDARD_PROMPT    — normaler Standardprompt
 *  2. BLUEPRINT          — reiner Blueprint
 *  3. HYBRID_CONTAMINATED — hybrider Prompt mit Artefakten
 *  4. SENSITIVE_BLOCKED  — künstlicher BLOCKING_SENSITIVE_CONTENT
 *  5. LONG_WINDOWS_PATH  — langer Prompt mit Windows-ähnlichem Pfad
 */

import type { PromptItem, AnalysisReport } from "./types";

// =============================================================================
// 1. STANDARD_PROMPT — Normaler Agent-Prompt
// =============================================================================

export const STANDARD_PROMPT: PromptItem = {
  id: "vg-001-standard",
  file_path: "/mock-vault/tasks/implement_search.md",
  file_name: "implement_search.md",
  title: "Implement Search Feature",
  description: "Task prompt for adding search functionality to a web app",
  category: "coding",
  version: "1.0",
  tags: ["frontend", "search", "feature"],
  content: `## Role
You are a senior frontend engineer specializing in React and TypeScript.

## Goal
Implement a full-text search feature for the document library component.

## Requirements
- Search across document titles and content
- Debounced input with 300ms delay
- Highlight matching terms in results
- Support fuzzy matching for typos
- Results sorted by relevance score

## Output Format
Return a React component \`SearchBar\` and a custom hook \`useSearch\`.

## Constraints
- Use only built-in browser APIs, no external search libraries
- Must work with the existing \`DocumentList\` component
- Include loading and empty states
- Keep bundle size under 5KB gzipped

## Verification
- All documents appear when search is empty
- Exact title match appears first
- Typo tolerance: "dcoument" finds "document"
- Debounce: typing fast fires only one search`,
  raw_frontmatter: {
    title: "Implement Search Feature",
    category: "coding",
    version: "1.0",
    tags: ["frontend", "search", "feature"],
  },
  created_at: "2026-01-15T10:00:00Z",
  updated_at: "2026-06-01T14:30:00Z",
  is_favorite: false,
};

// =============================================================================
// 2. BLUEPRINT — Reiner Architektur-Blueprint
// =============================================================================

export const BLUEPRINT: PromptItem = {
  id: "vg-002-blueprint",
  file_path: "/mock-vault/blueprints/notification-system.md",
  file_name: "notification-system.md",
  title: "Notification System Blueprint",
  description: "Architecture blueprint for a multi-channel notification system",
  category: "architecture",
  version: "2.1",
  tags: ["blueprint", "architecture", "notifications"],
  content: `## Goal
Design a multi-channel notification system supporting email, push, and in-app delivery.

## Scope

### In Scope
- Email notifications via SMTP provider
- Web push notifications (Service Worker)
- In-app notification bell with unread count
- User notification preferences per channel
- Retry with exponential backoff on delivery failure

### Out of Scope
- SMS or WhatsApp notifications
- Real-time WebSocket delivery (deferred to v2)
- Analytics dashboard for notification metrics

### MVP Cut
- Email + in-app channels only
- Default preferences for all users
- No preference UI (settings page in v2)

## Architecture
- Frontend: React context \`NotificationProvider\`
- Backend: Rust notification worker with job queue
- Storage: PostgreSQL jobs table with status tracking
- Email: AWS SES via SMTP adapter

## Data Flow
1. Application event fires (e.g., "document shared")
2. Notification service creates job record
3. Worker picks up pending jobs
4. Delivery attempted per user preferences
5. Status updated (PENDING → SENT / FAILED)
6. Retry on FAILED with exponential backoff (max 3 attempts)

## Security & Privacy
- Notification content must not leak document contents
- Email addresses stored hashed at rest
- Rate limiting: max 50 notifications per user per hour`,

  raw_frontmatter: {
    title: "Notification System Blueprint",
    category: "architecture",
    version: "2.1",
    tags: ["blueprint", "architecture", "notifications"],
  },
  created_at: "2026-02-20T09:00:00Z",
  updated_at: "2026-07-01T11:00:00Z",
  is_favorite: true,
};

// =============================================================================
// 3. HYBRID_CONTAMINATED —Hybrider Prompt mit Artefakten
// =============================================================================

export const HYBRID_CONTAMINATED: PromptItem = {
  id: "vg-003-hybrid",
  file_path: "/mock-vault/mixed/api-client-blueprint-with-notes.md",
  file_name: "api-client-blueprint-with-notes.md",
  title: "API Client — Draft with Notes",
  description: "Mixed blueprint with informal notes and chat residue",
  category: "uncategorized",
  version: "0.5",
  tags: ["draft", "api"],
  content: `## Role
You are a backend developer designing a REST API client library.

## Notes from meeting
- We should use axios? Or just fetch?
- Team prefers fetch for now
- Need to discuss error handling strategy

> User: what about retry logic?
> Dev: we'll add exponential backoff
> User: ok, and circuit breaker?
> Dev: maybe v2, keep it simple

## Goal
Build a typed HTTP client wrapper with retry and timeout support.

## Architecture
- Core: \`HttpClient\` class with pluggable middleware
- Retry middleware: exponential backoff (3 attempts)
- Timeout middleware: configurable per-request
- Response parsing: JSON auto-detection

## Out of Scope
- Circuit breaker pattern (v2)
- Request deduplication
- Cache layer

## Constraints
- Must work in Node.js 18+ and browser
- No runtime dependencies beyond fetch
- TypeScript strict mode

echo "DEBUG: api key is test-12345-not-real"
export API_URL="https://api.example.com/v2"

// TODO: add authentication middleware

## Verification
- Successful GET returns typed response
- Network error triggers retry
- Timeout throws TimeoutError after configured duration
- Invalid JSON response throws ParseError`,
  raw_frontmatter: {
    title: "API Client — Draft with Notes",
    category: "uncategorized",
    version: "0.5",
    tags: ["draft", "api"],
  },
  created_at: "2026-03-10T16:00:00Z",
  updated_at: "2026-05-20T08:00:00Z",
  is_favorite: false,
};

// =============================================================================
// 4. SENSITIVE_BLOCKED — Künstlicher BLOCKING_SENSITIVE_CONTENT-Prompt
// =============================================================================

export const SENSITIVE_BLOCKED: PromptItem = {
  id: "vg-004-blocked",
  file_path: "/mock-vault/private/credentials-import.md",
  file_name: "credentials-import.md",
  title: "Database Migration Script",
  description: "Contains hardcoded credentials — should be blocked",
  category: "devops",
  version: "1.0",
  tags: ["database", "migration"],
  content: `## Task
Import user data from legacy MySQL database into the new PostgreSQL instance.

## Connection Details
Host: production-db.internal.example.com
Port: 5432
Username: admin
Password: SuperSecret123!
API Key: sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234

## SSH Tunnel
ssh -L 5432:localhost:5432 deploy@bastion.example.com -i ~/.ssh/id_rsa_prod

## Steps
1. Connect to source MySQL
2. Export users table to CSV
3. Transform date formats to ISO 8601
4. Import into target PostgreSQL
5. Verify row counts match

## Private Key (for reference)
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3n9FakeKeyNotReal12345
-----END RSA PRIVATE KEY-----`,
  raw_frontmatter: {
    title: "Database Migration Script",
    category: "devops",
    version: "1.0",
    tags: ["database", "migration"],
  },
  created_at: "2026-04-05T12:00:00Z",
  updated_at: "2026-04-05T12:00:00Z",
  is_favorite: false,
};

// =============================================================================
// 5. LONG_WINDOWS_PATH — Langer Prompt mit Windows-ähnlichem Pfad
// =============================================================================

export const LONG_WINDOWS_PATH: PromptItem = {
  id: "vg-005-long-path",
  file_path:
    "C:\\Users\\developer\\Documents\\Projects\\enterprise-customer-portal\\specifications\\integration-layer\\third-party-connectors\\salesforce-sync-agent-specification-v3.md",
  file_name: "salesforce-sync-agent-specification-v3.md",
  title: "Salesforce Sync Agent — Specification v3",
  description:
    "Detailed specification for a bidirectional Salesforce synchronization agent with conflict resolution",
  category: "specification",
  version: "3.0",
  tags: ["salesforce", "integration", "sync", "enterprise"],
  content: `## Role
You are an enterprise integration architect designing a Salesforce synchronization agent.

## Goal
Implement a bidirectional sync agent between our internal CRM and Salesforce, handling conflict resolution, rate limiting, and incremental updates.

## Requirements

### Sync Direction
- Bidirectional: changes in either system propagate to the other
- Initial full sync on first connection
- Incremental sync using change data capture after initial sync

### Conflict Resolution
- Timestamp-based: most recent write wins
- Manual override: flagged conflicts create tickets in Jira
- Merge strategy for non-conflicting field updates

### Rate Limiting
- Respect Salesforce API limits (15,000 requests per 24h per license)
- Queue requests when approaching limit
- Prioritize critical updates (contacts, opportunities) over metadata sync

### Error Handling
- Retry transient failures (network, timeout) up to 3 times
- Dead-letter queue for permanent failures
- Alert on sync gap > 1 hour

### Data Mapping
- Contact → Contact (standard mapping)
- Account → Account (with custom fields for industry vertical)
- Opportunity → Opportunity (stage mapping: ours → Salesforce stages)
- Custom object "Subscription" → Custom object "Subscription__c"

## Architecture

\\\`\\\`\\\`mermaid
sequenceDiagram
    participant CRM
    participant SyncAgent
    participant Salesforce
    CRM->>SyncAgent: Change Event
    SyncAgent->>SyncAgent: Transform Data
    SyncAgent->>SyncAgent: Check Rate Limit
    SyncAgent->>Salesforce: API Call
    Salesforce-->>SyncAgent: Response
    SyncAgent->>SyncAgent: Handle Conflicts
    SyncAgent->>CRM: Update Sync Status
\\\`\\\`\\\`

## Output Format
- Configuration file: \`salesforce-sync.config.yaml\`
- Agent implementation: Rust binary with scheduling
- Monitoring: Prometheus metrics endpoint

## Constraints
- Must handle 100,000+ records per sync cycle
- Memory usage under 512 MB
- Sync latency under 5 minutes for critical updates
- No data loss: every change must be tracked

## Security
- OAuth 2.0 client credentials flow for Salesforce API
- Secrets stored in HashiCorp Vault, never in config files
- All data encrypted in transit (TLS 1.3)
- PII field-level encryption for contact data

## Verification
- Full sync completes without errors
- Incremental sync detects changes made during full sync
- Conflict resolution correctly applies timestamp strategy
- Rate limiter queues requests when approaching limit
- Dead-letter queue receives permanent failures
- Alert fires when sync gap exceeds threshold

## Test Data
\\\`\\\`\\\`json
{
  "contacts": [
    {"id": "C001", "name": "Alice Exampleton", "email": "alice@example.com"},
    {"id": "C002", "name": "Bob Sampleman", "email": "bob@example.com"}
  ],
  "accounts": [
    {"id": "A001", "name": "Acme Corporation", "industry": "Manufacturing"}
  ]
}
\\\`\\\`\\\``,
  raw_frontmatter: {
    title: "Salesforce Sync Agent — Specification v3",
    category: "specification",
    version: "3.0",
    tags: ["salesforce", "integration", "sync", "enterprise"],
  },
  created_at: "2026-05-01T08:00:00Z",
  updated_at: "2026-07-15T16:45:00Z",
  is_favorite: true,
};

// =============================================================================
// Export: all prompts and analysis fixtures
// =============================================================================

export const ALL_PROMPTS: PromptItem[] = [
  STANDARD_PROMPT,
  BLUEPRINT,
  HYBRID_CONTAMINATED,
  SENSITIVE_BLOCKED,
  LONG_WINDOWS_PATH,
];

export const MOCK_ANALYSIS: Record<string, AnalysisReport> = {
  [STANDARD_PROMPT.id]: {
    evaluations: [],
    hygiene: [],
    total_prompts: 1,
    average_score: 78,
  },
  [BLUEPRINT.id]: {
    evaluations: [],
    hygiene: [],
    total_prompts: 1,
    average_score: 85,
  },
  [HYBRID_CONTAMINATED.id]: {
    evaluations: [],
    hygiene: [{ type: "CHAT_META", severity: "WARNING" }],
    total_prompts: 1,
    average_score: 42,
  },
  [SENSITIVE_BLOCKED.id]: {
    evaluations: [],
    hygiene: [{ type: "BLOCKING_SENSITIVE_CONTENT", severity: "CRITICAL" }],
    total_prompts: 1,
    average_score: 0,
  },
  [LONG_WINDOWS_PATH.id]: {
    evaluations: [],
    hygiene: [],
    total_prompts: 1,
    average_score: 72,
  },
};
