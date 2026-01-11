# Discussion

## Provider Selection

### OpenRouter (Cloud)
- **Pros**: High-quality models, no local setup, fast responses
- **Cons**: Requires API key, costs money, data sent to cloud
- **Use cases**: Users who want best quality, don't mind cloud, have API budget

### Ollama (Local)
- **Pros**: Complete privacy, no API costs, works offline, full control
- **Cons**: Requires local installation, hardware requirements, potentially slower
- **Use cases**: Privacy-conscious users, users with capable hardware, offline use

## Model Selection

### OpenRouter Models

Models are discovered dynamically from OpenRouter API. Common models include:

#### Recommended: moonshotai/kimi-k2:free
- **Default suggested model**
- Free tier, good quality
- Use for: All tasks (review, revision, suggestions)
- Best starting point for new users

#### Other Free Models
- mistralai/devstral-2512:free
- xiaomi/mimo-v2-flash:free
- nvidia/nemotron-3-nano-30b-a3b:free
- arcee-ai/trinity-mini:free
- z-ai/glm-4.5-air:free

#### Other Models
- GPT-OSS-120b (`openai/gpt-oss-120b`): Good quality, low cost
- Gemini 3 Flash Preview (`google/gemini-3-flash-preview`): Good quality, low cost
- GPT-4o-mini (`openai/gpt-4o-mini`): Good quality, mid cost
- Kimi-K2 Thinking (`moonshotai/kimi-k2-thinking`): Best quality, higher cost
- GPT-5.2 Chat (`openai/gpt-5.2-chat`): High quality, highest cost
- Claude (`anthropic/claude-3-opus`): Alternative high-quality model

**Model Discovery:**
- Fetch available models from OpenRouter API on demand
- Cache model list locally to reduce API calls
- Display model metadata (pricing, context length) in selector
- User selects preferred model, stored in settings

### Ollama Models

#### llama2
- Good general purpose
- 7B/13B/70B variants
- Use for: General writing tasks

#### mistral
- High quality, efficient
- Good for: Review and revision

#### codellama
- Code-focused
- Use for: Technical documentation

#### User's Choice
- Users can install any Ollama-compatible model
- UI should discover and list available models

## Cost Management

### OpenRouter
- Show cost estimates before requests
- Track usage per user
- Warn about high costs
- Cache responses when appropriate

### Ollama
- No cost tracking needed
- Show model info instead
- Display inference time if available

## Error Handling

### OpenRouter
- Rate limit errors: Show retry time
- Invalid key: Prompt to update
- Network errors: Retry with backoff
- Model errors: Show error message

### Ollama
- Connection refused: Guide user to start Ollama
- Model not found: Prompt to install model
- CORS errors: Provide CORS configuration guide
- Timeout: Show that model may be slow
- Out of memory: Suggest smaller model

## User Experience

### Provider Selection
- Clear UI for selecting provider
- Show provider status (connected/disconnected)
- Easy switching between providers
- Remember last used provider

### Model Selection

**OpenRouter:**
- Model selector prominently displayed in AI sidebar/settings
- Show available models with key metadata:
  - Model name and provider (e.g., "moonshotai/kimi-k2:free")
  - Pricing information (cost per 1K tokens)
  - Context length
  - Recommended use cases
- **Filter-by-price feature**: Filter models by price tier
  - Free: $0 per 1K tokens (e.g., moonshotai/kimi-k2:free)
  - Low-cost: < $0.01 per 1K tokens
  - Medium-cost: $0.01 - $0.05 per 1K tokens
  - High-cost: > $0.05 per 1K tokens
- User can change model at any time
- Selected model persists across sessions
- Show selected model in UI (e.g., "Using: moonshotai/kimi-k2:free")
- **Default/recommended model**: moonshotai/kimi-k2:free (suggested when no model selected)

**Ollama:**
- Model selector shows locally installed models
- Display model name and size/variant (e.g., "llama2:7b")
- Show model status (loaded, available)
- User can change model at any time
- Selected model persists across sessions
- Show selected model in UI
- Refresh button to discover newly installed models

**Model Selection UX:**
- Dropdown or list selector, easily accessible
- Search/filter for large model lists (OpenRouter)
- **Price filter**: Toggle buttons or dropdown to filter by price tier
- Visual indicators for recommended models (highlight moonshotai/kimi-k2:free)
- Cost warnings for expensive models (OpenRouter)
- Quick model switching without leaving current context
- Price filter persists during session (remember user's filter preference)

### OpenRouter
- Show loading during API calls
- Display results clearly
- Allow applying suggestions
- Show cost information (based on selected model)
- Track usage statistics per model
- Display selected model in cost estimates

### Ollama
- Show connection status
- Display selected model prominently
- Show inference progress if possible
- Handle slow responses gracefully
- Provide setup instructions if needed

## Implementation Considerations

### API Compatibility
- Both providers use similar chat completion format
- Need adapter layer to normalize differences
- Ollama uses `/api/chat` endpoint
- OpenRouter uses `/api/v1/chat/completions`

### Configuration Storage
- Store provider preference encrypted
- Store OpenRouter key encrypted
- Store Ollama URL and model (can be plaintext, but encrypt for consistency)
- Validate configuration on load

### Connection Management
- Test OpenRouter connection on key entry
- Test Ollama connection on URL/model change
- Show connection status in UI
- Handle connection failures gracefully

## Agentic AI Workflow

### Workflow Overview

The agentic AI feature automates the revision process by:
1. Creating a branch from the current document
2. Applying AI revisions based on user instructions
3. Submitting the branch for review
4. Opening the merge diff view automatically

### User Experience

- User provides natural language instructions (e.g., "Make this more formal", "Simplify the language", "Add more detail to section 2")
- System shows progress: "Creating branch...", "Applying revisions...", "Submitting branch..."
- After completion, merge diff view opens automatically
- User can review all changes side-by-side
- User can merge, reject, or make additional edits before merging

### Benefits

- Non-destructive: Changes are in a branch, original document is safe
- Reviewable: User sees all changes before merging
- Reversible: User can reject if not satisfied
- Integrated: Works with existing branch/merge workflow

### Error Handling

- If branch creation fails: Show error, allow retry
- If AI revision fails: Show error, branch remains with original content
- If submission fails: Show error, allow manual submission
- If diff view fails to open: Show error, provide manual link to view branch

### Integration Points

- Requires branchService (TICKET-008)
- Uses BranchDiffView component (TICKET-008)
- Works with both OpenRouter and Ollama providers
- Respects document permissions (only users with write access can create branches)

### Instruction Templates

#### Purpose
- Allow users to save frequently used revision instructions
- Enable quick reuse with minimal clicks
- Improve workflow efficiency for repetitive tasks

#### Common Use Cases
- "Make this more formal" - for professional documents
- "Simplify the language" - for accessibility
- "Add more detail to section X" - for expanding content
- "Fix grammar and spelling" - for proofreading
- "Convert to markdown format" - for formatting tasks

#### UI Design
- **Save Template**: Button appears after user enters instructions
- **Template Selector**: Dropdown or list near instructions input
- **Quick Insert**: Click template name to insert into instructions field
- **Template Management**: Edit/delete options in same UI (no separate page)
- **Minimal Clicks**: Template insertion should be 1-2 clicks maximum

#### Storage Considerations
- Templates are user-specific (stored per user)
- Encrypted with same key as API keys (user's derived key)
- Stored in GunDB user settings node
- No limit on number of templates (reasonable default: 20-50)
- Templates can be edited or deleted at any time

#### User Experience Flow
1. User enters revision instructions
2. User clicks "Save Instruction Template"
3. Dialog prompts for template name (or they can click a magic sparkle icon to have an AI create a template name)
4. Template saved and appears in template selector
5. Later: User clicks template name → instructions auto-filled
6. User can edit/delete templates from template list
