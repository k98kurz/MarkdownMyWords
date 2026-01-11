# [TICKET-009] LLM Integration (OpenRouter & Ollama)

## Metadata
- **Status**: ready
- **Complexity**: task_list
- **Service(s)**: frontend
- **Created**: 2026-01-11
- **Estimate**: 11h
- **Depends on**: TICKET-002, TICKET-005, TICKET-008

## Request

Integrate LLM providers (OpenRouter API and Ollama) for AI-powered document review, revision, and content suggestions. Support both cloud-based (OpenRouter) and local/self-hosted (Ollama) LLM options.

### User Story

As a user, I want AI-powered features to help improve my writing through review, revision, and suggestions, with the option to use either cloud-based or local LLM services for privacy and cost control.

As a user, I want an agentic AI feature that creates a branch, applies AI revisions based on my instructions, and automatically opens the merge diff view so I can review and approve the changes before merging.

### Requirements

1. **LLM Service Architecture**
   - Provider abstraction layer (supports multiple providers)
   - OpenRouter API client
   - Ollama API client
   - Review document functionality
   - Revise document functionality
   - Suggest content functionality
   - Cost estimation (OpenRouter only)
   - Usage tracking

2. **Provider Configuration**
   - Provider selection (OpenRouter or Ollama)
   - OpenRouter API key management (encrypted storage)
   - OpenRouter model selection UI (user selects from available models)
   - Ollama connection settings (base URL, model selection)
   - Ollama model selection UI (user selects from installed models)
   - Connection validation for both providers
   - Model discovery for both providers (fetch available models)

3. **OpenRouter Integration**
   - API key storage (encrypted)
   - API key validation
   - Model discovery (fetch available models from OpenRouter API)
   - Model selection from available models
   - Cost estimation
   - Usage tracking
   - Rate limiting

4. **Ollama Integration**
   - Local server connection (default: http://localhost:11434)
   - Model selection from available models
   - Connection status checking
   - Error handling for unreachable server
   - CORS handling (if needed)
   - No cost tracking (local inference)

5. **AI Features** (Provider-agnostic)
   - Review document (analyze and suggest improvements)
   - Revise document (apply AI suggestions)
   - Suggest content (generate content ideas)

6. **UI Components**
   - Provider selection in settings
   - AISidebar component
   - Model selector UI (prominent, user-facing component for both providers)
     - Display available models with metadata (name, pricing, context length)
     - Filter-by-price feature (free, low-cost, medium-cost, high-cost)
     - Allow user to select preferred model
     - Show selected model in UI
     - Model selection persists across sessions
     - Recommended model: moonshotai/kimi-k2:free (default suggestion)
   - Review results display
   - Cost display (OpenRouter only)
   - Usage statistics
   - Connection status indicator (Ollama)

7. **Agentic AI Workflow**
   - Create branch from current document
   - Apply AI revisions to branch based on user instructions
   - Submit branch for review (status: "submitted")
   - Automatically open merge diff view after branch submission
   - Integration with branch service for branch operations
   - Integration with merge diff view component
   - Instruction template management (save, load, insert templates)
   - Template storage (encrypted in user settings)

## Acceptance Criteria

- [ ] Provider abstraction layer implemented
- [ ] OpenRouter API client implemented
- [ ] Ollama API client implemented
- [ ] Provider selection UI implemented
- [ ] Review document working (both providers)
- [ ] Revise document working (both providers)
- [ ] Suggest content working (both providers)
- [ ] OpenRouter API key storage working (encrypted)
- [ ] OpenRouter model discovery working
- [ ] OpenRouter model selection UI working (user can see and select models)
- [ ] Ollama connection configuration working
- [ ] Ollama model discovery working
- [ ] Ollama model selection UI working (user can see and select models)
- [ ] Model selector displays model metadata (pricing, context length)
- [ ] Filter-by-price feature working (free, low-cost, medium-cost, high-cost)
- [ ] Recommended model (moonshotai/kimi-k2:free) suggested by default
- [ ] Selected model persists across sessions
- [ ] Selected model displayed prominently in UI
- [ ] Connection validation for both providers
- [ ] Cost estimation working (OpenRouter)
- [ ] Usage tracking working (OpenRouter)
- [ ] Error handling implemented (both providers)
- [ ] Rate limiting handled (OpenRouter)
- [ ] UI components created
- [ ] Graceful handling when Ollama is unreachable
- [ ] Agentic workflow creates branch from document
- [ ] Agentic workflow applies AI revisions to branch
- [ ] Agentic workflow submits branch automatically
- [ ] Merge diff view opens automatically after branch submission
- [ ] Integration with branch service working
- [ ] Instruction template saving working
- [ ] Instruction template loading and insertion working
- [ ] Template management UI integrated in agentic workflow

## Technical Notes

### LLM Service Interface

```typescript
type LLMProvider = 'openrouter' | 'ollama';

interface LLMConfig {
  provider: LLMProvider;
  // OpenRouter config
  openRouterApiKey?: string;
  openRouterModel?: string;  // Selected model (e.g., "openai/gpt-4")
  // Ollama config
  ollamaBaseUrl?: string; // Default: http://localhost:11434
  ollamaModel?: string;   // User's installed model
}

interface LLMService {
  // Provider management
  setProvider(provider: LLMProvider): void;
  getProvider(): LLMProvider;
  validateConnection(): Promise<boolean>;

  // Core features (provider-agnostic)
  reviewDocument(content: string, options?: ReviewOptions): Promise<ReviewResult>;
  reviseDocument(content: string, instructions: string): Promise<string>;
  suggestContent(context: string, prompt: string): Promise<string[]>;

  // OpenRouter-specific
  estimateCost(model: string, promptTokens: number, completionTokens: number): Promise<number>;
  trackUsage(model: string, usage: TokenUsage): void;
  getUsageStats(): UsageStats;

  // Model discovery (both providers)
  getAvailableModels(): Promise<string[]>;  // Returns model identifiers
}
```

### OpenRouter Configuration Storage

- API key: Encrypt with user's derived key, store in GunDB user settings, decrypt on use, never store plaintext
- Selected model: Store model identifier (e.g., "openai/gpt-4") in user settings
- Model discovery: Fetch available models from OpenRouter API (`GET /api/v1/models`)
- Model list cached locally, refreshed on demand or periodically

### Ollama Configuration Storage

- Store base URL (default: http://localhost:11434)
- Store selected model name
- Store in GunDB user settings (encrypted)
- Validate connection on startup
- Handle CORS if needed

### Provider Selection

- User selects provider in settings
- Settings stored encrypted in GunDB
- Provider can be switched at runtime
- Connection status shown in UI

### Model Discovery

**OpenRouter:**
- Endpoint: `GET https://openrouter.ai/api/v1/models`
- Returns list of available models with metadata (name, pricing, context length, etc.)
- Cache model list locally to reduce API calls
- Refresh on demand or when API key changes
- **UI**: Model selector displays all available models with metadata for user selection
- **Recommended model**: `moonshotai/kimi-k2:free` (suggested by default, free tier)

**Ollama:**
- Endpoint: `GET http://localhost:11434/api/tags`
- Returns list of locally installed models
- Refresh on connection or on demand
- **UI**: Model selector displays installed models for user selection

### Model Selection UI

Model selection is a **prominent user-facing feature**, not a hidden configuration:

- Model selector component visible in AI sidebar or settings
- Users can see and select from available models at any time
- **Filter-by-price**: Users can filter models by price tier (free, low-cost, medium-cost, high-cost)
- Selected model displayed prominently (e.g., "Using: moonshotai/kimi-k2:free")
- Model metadata (pricing, context length) shown to help users choose
- **Recommended model**: `moonshotai/kimi-k2:free` suggested by default (free tier, good quality)
- Selection persists across sessions
- Quick switching without leaving current context

### Type Definitions

```typescript
interface ReviewOptions {
  focus?: 'grammar' | 'style' | 'clarity' | 'all';
  language?: string;
}

interface ReviewResult {
  suggestions: Array<{
    type: 'grammar' | 'style' | 'clarity' | 'other';
    severity: 'error' | 'warning' | 'suggestion';
    text: string;
    position?: { start: number; end: number };
    suggestion: string;
  }>;
  summary: string;
  score?: number;  // Overall quality score
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  estimatedCost: number;
  requestsByModel: Record<string, number>;
}
```

### Agentic AI Workflow

The agentic AI feature provides an automated workflow for applying AI revisions:

1. User provides revision instructions or leaves the pre-filled generic instructions
2. System creates a branch from the current document
3. AI revises the document content based on instructions
4. Revised content is saved to the branch
5. Branch is automatically submitted (status: "submitted")
6. Merge diff view opens automatically for user review
7. User can review changes and merge or reject

```typescript
interface AgenticRevisionOptions {
  instructions: string;  // User's revision instructions
  docId: string;        // Document to revise
  branchDescription?: string;  // Optional branch description
}

interface AgenticRevisionResult {
  branchId: string;
  originalContent: string;
  revisedContent: string;
  diff: Diff;  // Diff between original and revised
}

interface LLMService {
  // ... existing methods ...

  // Agentic workflow
  agenticRevise(
    docId: string,
    instructions: string,
    options?: AgenticRevisionOptions
  ): Promise<AgenticRevisionResult>;
}
```

### Integration with Branch System

- Uses `branchService.createBranch()` to create branch
- Uses `branchService.submitBranch()` to submit for review
- Uses `branchService.getBranchDiff()` to generate diff
- Opens `BranchDiffView` component after submission
- Branch status transitions: created → pending → submitted

### Instruction Template Management

Users can save frequently used revision instructions as templates for quick reuse:

```typescript
interface InstructionTemplate {
  id: string;
  name: string;
  instructions: string;
  createdAt: number;
  updatedAt: number;
}

interface TemplateService {
  saveTemplate(name: string, instructions: string): Promise<InstructionTemplate>;
  getTemplates(): Promise<InstructionTemplate[]>;
  deleteTemplate(id: string): Promise<void>;
  updateTemplate(id: string, name: string, instructions: string): Promise<InstructionTemplate>;
}
```

**Storage:**
- Templates stored encrypted in GunDB user settings
- Encrypted with user's derived key (same as API keys)
- Never store plaintext instructions

**UI Integration:**
- "Save Instruction Template" button in agentic workflow UI
- Template selector/dropdown for quick insertion
- One-click template insertion into instructions field
- Template management (edit, delete) in same UI

## Related

- TICKET-001: Architecture (LLM integration reference)
- TICKET-004: Encryption system (for API key encryption)
- TICKET-005: Authentication (for user key)
- TICKET-008: Sharing & Permissions System (branch system integration)