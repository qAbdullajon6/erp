# AI Copilot & Business Agent — API Reference

## Overview

The AI Copilot is a real-time conversational business agent embedded in FlowERP. It uses large language models (LLMs) to accomplish ERP work entirely through conversation — searching data, executing multi-step workflows, coordinating actions, and maintaining persistent conversations with memory.

### Business Agent Capabilities

- **Multi-step planning**: Breaks complex requests into steps (search → resolve → act → report)
- **Entity resolution**: Pronouns ("it", "him", "that order") resolve against conversation memory
- **Error recovery**: Retries transient failures, tries alternative approaches on permanent failures
- **Approval mode**: Dangerous actions (delete, mass update, invoice creation) require explicit user confirmation
- **Read-only mode**: Observation-only conversations that can analyse without modifying data
- **Execution trace**: Every response carries hidden metadata (tools called, duration, retries, failures)

## Architecture

```
┌─────────────┐     SSE      ┌─────────────┐    tools    ┌───────────────┐
│  Frontend   │──────────────▶│ AiService   │────────────▶│ Domain Modules│
│  (React)    │◀──────────────│ (Agent Loop)│◀────────────│ (Orders, etc.)│
└─────────────┘               └──────┬──────┘             └───────────────┘
                                     │
                              ┌──────┴──────┐
                              │  Provider   │
                              │  (LLM API)  │
                              └─────────────┘
```

### Provider Abstraction

Four LLM providers supported via raw `fetch` (no SDK dependencies):

| Provider | Endpoint | Model Examples |
|----------|----------|----------------|
| Anthropic | Messages API | claude-sonnet-4-20250514 |
| OpenAI | Chat Completions | gpt-4o |
| Gemini | generateContent | gemini-2.5-flash |
| Ollama | OpenAI-compatible | llama3, mixtral |

Configuration via environment variables:
- `AI_PROVIDER`: `anthropic` | `openai` | `gemini` | `ollama`
- `AI_MODEL`: Model identifier (provider-specific)
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`
- `OPENAI_BASE_URL` (for Azure or compatible endpoints)
- `OLLAMA_BASE_URL` (default `http://localhost:11434`)

### Security Model

1. **Tool-level RBAC**: Tools are filtered by role _before_ the model sees them. A dispatcher's model never learns `finance_summary` exists.
2. **Execution-time re-check**: Every tool call is re-verified against the actor's role at execution time.
3. **Organization scoping**: Every query is scoped by the actor's `organizationId` — cannot be influenced by the model.
4. **Prompt injection guard**: Pattern-based detection of instruction override attempts, with audit logging.
5. **Output filter**: Credential-shaped content is redacted from responses (split-chunk-safe for streaming).
6. **Rate limiting**: Per-user, per-hour cap to control LLM cost.

## REST API

All endpoints require authentication (`Authorization: Bearer <jwt>`).

Base path: `/api/ai`

### Capabilities

```
GET /api/ai/capabilities
```

Returns what the current user can do with the Copilot.

**Response:**
```json
{
  "available": true,
  "configured": true,
  "provider": "anthropic",
  "models": [{ "id": "claude-sonnet-4-20250514", "label": "Claude Sonnet 4", "supportsTools": true, "contextWindow": 200000 }],
  "defaultModel": "claude-sonnet-4-20250514",
  "tools": [{ "name": "search_orders", "description": "...", "mutating": false }],
  "suggestions": ["Summarise today's operations", "Which orders are running late?"],
  "rateLimit": { "remaining": 28, "resetAt": 1721232000000 }
}
```

### Health

```
GET /api/ai/health
```

**Response:**
```json
{
  "configured": true,
  "provider": "anthropic",
  "configuredProviders": ["anthropic"]
}
```

### Conversations

```
POST   /api/ai/conversations          — Create
GET    /api/ai/conversations          — List (paginated, searchable)
GET    /api/ai/conversations/:id      — Get with messages
PATCH  /api/ai/conversations/:id      — Rename
POST   /api/ai/conversations/:id/pin  — Pin/unpin
POST   /api/ai/conversations/:id/status — Archive/restore
DELETE /api/ai/conversations/:id      — Soft-delete
```

**Create:**
```json
POST /api/ai/conversations
{ "title": "Optional title", "model": "claude-sonnet-4-20250514", "readOnly": false }
```

Setting `readOnly: true` creates an **observation-only** conversation. The model can search and analyse data but mutating tools are excluded from the prompt entirely. This is irreversible per conversation — the mode is fixed at creation time for audit clarity.

**List query params:** `page`, `limit`, `search`, `status` (ACTIVE|ARCHIVED)

### Chat (SSE Streaming)

```
POST /api/ai/conversations/:id/chat
Content-Type: application/json
{ "message": "Show me overdue invoices" }
```

**Response**: Server-Sent Events stream (`text/event-stream`)

Events:
```
data: {"type":"text","text":"Looking up..."}

data: {"type":"tool_start","name":"search_invoices"}

data: {"type":"tool_end","name":"search_invoices","status":"SUCCEEDED","durationMs":142}

data: {"type":"text","text":"You have 4 overdue invoices..."}

data: {"type":"done","messageId":"msg_xyz","usage":{"promptTokens":1200,"completionTokens":340},"finishReason":"stop","trace":{"iterations":2,"toolsCalled":[{"name":"search_invoices","status":"SUCCEEDED","durationMs":142}],"totalDurationMs":3200,"retries":0,"failures":0,"recovered":0}}
```

Confirmation required (dangerous action):
```
data: {"type":"confirmation_required","action":"Delete 3 archived orders","details":{"orderIds":["..."]}}
```

Error mid-stream:
```
data: {"type":"error","message":"Rate limit exceeded. Try again in 12 minutes."}
```

### Cancel

```
POST /api/ai/conversations/:id/cancel
```

Stops the in-flight generation and provider request.

### Confirm Action

```
POST /api/ai/conversations/:id/confirm
Content-Type: application/json
{ "confirmed": true }
```

Confirms or denies a dangerous action the AI requested approval for. When the AI identifies a potentially destructive operation (delete, archive, mass update, invoice/payment approval), it pauses and emits a `confirmation_required` SSE event. The user must confirm before execution proceeds.

### Memory

```
GET    /api/ai/memory       — List user's memories
POST   /api/ai/memory       — Remember (kind: PINNED | PREFERENCE)
DELETE /api/ai/memory/:id   — Forget
```

## Tools

### Read Tools (non-mutating)

| Tool | Description | Roles |
|------|-------------|-------|
| `search_customers` | Find customers by name, city, status | All staff |
| `search_orders` | Find orders by number, status, date range | All staff |
| `search_drivers` | Find drivers by name, status, availability | Ops, Admin |
| `search_vehicles` | Find vehicles by plate, code, status | Ops, Admin |
| `search_dispatches` | Find dispatches by status, driver, date | Ops, Admin |
| `search_invoices` | Find invoices by number, status, customer | Finance, Admin |
| `list_notifications` | Recent notifications for the user | All staff |
| `import_status` | Status of recent data imports | Admin, Ops |

### Write Tools (mutating)

| Tool | Description | Roles |
|------|-------------|-------|
| `create_customer` | Create a new customer record | Sales, Admin |
| `create_order` | Create an order | Ops, Admin |
| `assign_driver` | Assign a driver+vehicle to an order | Dispatcher, Ops, Admin |
| `create_workflow` | Trigger a workflow | Admin |

### Analytics Tools

| Tool | Description | Roles |
|------|-------------|-------|
| `finance_summary` | Revenue, receivables, expenses, margin | Finance, Admin |
| `generate_report` | Executive overview for a date range | Admin, Ops, Accountant |
| `dashboard_summary` | Today's operational counts by status | All staff |
| `fleet_utilization` | Driver/vehicle workload over N days | Ops, Admin |
| `developer_api_usage` | API call volume, success rate, latency | Admin, Ops |

## RAG (Knowledge Retrieval)

The Copilot retrieves relevant documentation chunks using Postgres full-text search (GIN index on `ai_knowledge_docs`). Documents are seeded from the `docs/` directory at boot and re-ingested idempotently on restart.

## Memory System

| Kind | Budget | Scope | Eviction |
|------|--------|-------|----------|
| PINNED | 10 | Global (user) | Never |
| PREFERENCE | 10 | Global (user) | Oldest first |
| ENTITY_REFERENCE | 8 | Per conversation | Oldest first |
| SUMMARY | 3 | Per conversation | Oldest first |

## Execution Trace

Every `done` event carries a `trace` object for audit and debugging:

```json
{
  "iterations": 3,
  "toolsCalled": [
    { "name": "search_customers", "status": "SUCCEEDED", "durationMs": 85 },
    { "name": "search_orders", "status": "SUCCEEDED", "durationMs": 120 },
    { "name": "assign_driver", "status": "SUCCEEDED", "durationMs": 340 }
  ],
  "totalDurationMs": 4200,
  "retries": 0,
  "failures": 0,
  "recovered": 0
}
```

| Field | Description |
|-------|-------------|
| `iterations` | Agent loop iterations (1 = answered immediately, >1 = used tools) |
| `toolsCalled` | Every tool invocation with result status and latency |
| `totalDurationMs` | Wall-clock time from message received to response complete |
| `retries` | Transient failures retried automatically |
| `failures` | Tools that failed permanently (model informed, may try alternative) |
| `recovered` | Retries that succeeded on the second attempt |

## Error Recovery

The agent retries tools automatically when the failure is transient:
- Network errors (ECONNREFUSED, ECONNRESET, timeout)
- Server errors (503, 429)
- Database lock contention (deadlock)

Permanent failures (validation errors, permission denials, not-found) are NOT retried — the error is fed back to the model, which may try an alternative approach (different search terms, different tool).

## Approval Mode

Dangerous actions require explicit user confirmation before execution:

| Action Category | Examples |
|----------------|----------|
| Deletions | Archive/delete orders, customers, conversations |
| Mass operations | Bulk status updates, batch assignments |
| Financial | Invoice creation, expense approval, payment approval |
| Notifications | Mass email/notification sends |

The model is instructed to ask "Do you want me to continue?" and wait for the user's response. The frontend shows a confirmation banner with action details.

## Read-Only Mode

A conversation created with `readOnly: true` operates in observation mode:
- Mutating tools are excluded from the model's tool list entirely
- The system prompt explicitly states the conversation cannot modify data
- If a user asks for changes, the model explains the limitation
- The `readOnly` flag is immutable once set (audit trail clarity)

Use cases: data exploration, report generation, training new staff, compliance review.

## Error Codes

| HTTP | Meaning |
|------|---------|
| 400 | Invalid input (empty message, bad conversation state) |
| 403 | AI not available for this role (DRIVER) |
| 404 | Conversation not found or not owned by user |
| 429 | Rate limit exceeded |
| 503 | AI provider not configured or unreachable |

## Configuration Reference

```env
# Required: choose one provider
AI_PROVIDER=anthropic

# Provider keys (only the chosen provider's key is required)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...

# Optional overrides
AI_MODEL=claude-sonnet-4-20250514
AI_MAX_TOKENS=4096
AI_TEMPERATURE=0.3
AI_MAX_TOOL_ITERATIONS=8
AI_REQUEST_TIMEOUT_MS=60000
AI_RATE_LIMIT_PER_HOUR=30

# For OpenAI-compatible endpoints
OPENAI_BASE_URL=https://api.openai.com/v1
OLLAMA_BASE_URL=http://localhost:11434
```
