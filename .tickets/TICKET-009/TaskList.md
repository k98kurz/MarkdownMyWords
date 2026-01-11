# Task List

## LLM Service Architecture

- [ ] Create provider abstraction interface
- [ ] Create llmService file with provider switching
- [ ] Implement provider factory pattern
- [ ] Add provider configuration management

## OpenRouter Integration

- [ ] Implement OpenRouter API client
- [ ] Implement model discovery (fetch from /api/v1/models)
- [ ] Implement model list caching
- [ ] Implement model selection storage
- [ ] Implement reviewDocument (OpenRouter)
- [ ] Implement reviseDocument (OpenRouter)
- [ ] Implement suggestContent (OpenRouter)
- [ ] Implement cost estimation
- [ ] Implement usage tracking
- [ ] Add error handling
- [ ] Add rate limiting

## Ollama Integration

- [ ] Implement Ollama API client
- [ ] Implement reviewDocument (Ollama)
- [ ] Implement reviseDocument (Ollama)
- [ ] Implement suggestContent (Ollama)
- [ ] Implement model discovery (fetch available models)
- [ ] Implement connection validation
- [ ] Add error handling (unreachable server, model not found, etc.)
- [ ] Handle CORS if needed
- [ ] Add connection status checking

## Provider Configuration

- [ ] Create provider selection UI component
- [ ] Create OpenRouter configuration UI
- [ ] Create OpenRouter model selector component
- [ ] Create Ollama configuration UI
- [ ] Implement provider switching logic
- [ ] Implement configuration storage (encrypted)
- [ ] Implement configuration retrieval
- [ ] Add connection testing/validation UI

## API Key Management (OpenRouter)

- [ ] Create API key input component
- [ ] Implement key validation
- [ ] Implement key encryption
- [ ] Implement key storage
- [ ] Implement key retrieval
- [ ] Implement key decryption

## Ollama Configuration Management

- [ ] Create Ollama base URL input
- [ ] Create model selector component
- [ ] Implement model discovery API call
- [ ] Implement configuration storage
- [ ] Implement connection testing
- [ ] Add connection status indicator

## AI Features (Provider-agnostic)

- [ ] Create review prompt templates
- [ ] Create revise prompt templates
- [ ] Create suggest prompt templates
- [ ] Parse review results
- [ ] Handle API responses (both providers)
- [ ] Handle API errors (both providers)
- [ ] Normalize responses between providers

## UI Components

- [ ] Create AISidebar component
- [ ] Create provider selector component
- [ ] Create ReviewButton
- [ ] Create ReviseButton
- [ ] Create SuggestButton
- [ ] Create ReviewResults component
- [ ] Create CostDisplay component (OpenRouter only)
- [ ] Create UsageStats component (OpenRouter only)
- [ ] Create ConnectionStatus component (Ollama)
- [ ] Create ModelSelector component (OpenRouter and Ollama)
- [ ] Display model list with metadata (name, pricing, context length)
- [ ] Implement model search/filter for OpenRouter (large model lists)
- [ ] Implement filter-by-price feature (free, low-cost, medium-cost, high-cost)
- [ ] Implement price tier categorization logic
- [ ] Set moonshotai/kimi-k2:free as recommended/default model
- [ ] Show selected model prominently in UI
- [ ] Add visual indicators for recommended models
- [ ] Add cost warnings for expensive models (OpenRouter)
- [ ] Implement model selection persistence
- [ ] Add refresh button for model discovery
- [ ] Display model status (Ollama: loaded/available)
- [ ] Add loading states
- [ ] Add error messages
- [ ] Add provider-specific UI indicators

## Agentic AI Workflow

- [ ] Implement agenticRevise method in LLMService
- [ ] Create branch creation integration (use branchService.createBranch)
- [ ] Implement AI revision on branch content
- [ ] Implement branch submission (use branchService.submitBranch)
- [ ] Implement automatic diff generation (use branchService.getBranchDiff)
- [ ] Implement automatic merge diff view opening
- [ ] Create AgenticReviseButton component
- [ ] Create revision instructions input UI
- [ ] Add loading states for agentic workflow
- [ ] Add error handling for branch operations
- [ ] Handle branch creation failures
- [ ] Handle AI revision failures
- [ ] Handle branch submission failures
- [ ] Test agentic workflow end-to-end
- [ ] Test with both OpenRouter and Ollama providers

## Instruction Template Management

- [ ] Create TemplateService interface
- [ ] Implement template storage (encrypted in GunDB user settings)
- [ ] Implement template retrieval
- [ ] Implement template save functionality
- [ ] Implement template delete functionality
- [ ] Implement template update functionality
- [ ] Create "Save Instruction Template" button component
- [ ] Create template name input dialog
- [ ] Create template selector/dropdown component
- [ ] Implement one-click template insertion
- [ ] Create template list display (in agentic workflow UI)
- [ ] Add template edit functionality
- [ ] Add template delete functionality (with confirmation)
- [ ] Add template encryption/decryption
- [ ] Test template save/load/delete operations

## Integration

- [ ] Connect AI sidebar to document
- [ ] Integrate with editor
- [ ] Apply suggestions to document
- [ ] Integrate agentic workflow with branch system
- [ ] Integrate agentic workflow with merge diff view
- [ ] Test all AI features (both providers)
- [ ] Test error scenarios (both providers)
- [ ] Test provider switching
- [ ] Test offline scenarios (Ollama)
- [ ] Test agentic workflow integration
