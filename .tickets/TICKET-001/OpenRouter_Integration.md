# OpenRouter API Integration

## Overview

OpenRouter provides a unified API to access multiple LLM providers. MarkdownMyWords integrates OpenRouter client-side, requiring users to provide their own API keys.

## API Basics

### Endpoint
```
POST https://openrouter.ai/api/v1/chat/completions
```

### Authentication
```
Authorization: Bearer {api_key}
```

### Request Format
```typescript
interface OpenRouterRequest {
  model: string;              // Model identifier (e.g., "openai/gpt-4")
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;        // 0-2, default 1
  max_tokens?: number;        // Maximum tokens in response
  top_p?: number;             // Nucleus sampling
  frequency_penalty?: number; // -2 to 2
  presence_penalty?: number;  // -2 to 2
}
```

### Response Format
```typescript
interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

## Integration Patterns

### Service Interface

```typescript
interface LLMService {
  // Review document for improvements
  reviewDocument(content: string, options?: ReviewOptions): Promise<ReviewResult>;

  // Revise document with suggestions
  reviseDocument(content: string, instructions: string): Promise<string>;

  // Generate content suggestions
  suggestContent(context: string, prompt: string): Promise<string[]>;

  // Estimate cost before making request
  estimateCost(model: string, promptTokens: number): Promise<number>;
}
```

### Review Document

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

async function reviewDocument(
  content: string,
  options: ReviewOptions = {}
): Promise<ReviewResult> {
  const systemPrompt = `You are a writing assistant. Review the following markdown document and provide suggestions for improvement. Focus on: ${options.focus || 'all'}.`;

  const userPrompt = `Please review this markdown document:\n\n${content}\n\nProvide specific suggestions for improvement.`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'MarkdownMyWords'
    },
    body: JSON.stringify({
      model: 'openai/gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })
  });

  const data: OpenRouterResponse = await response.json();
  return parseReviewResponse(data.choices[0].message.content);
}
```

### Revise Document

```typescript
async function reviseDocument(
  content: string,
  instructions: string
): Promise<string> {
  const systemPrompt = `You are a writing assistant. Revise the following markdown document according to the user's instructions. Return only the revised markdown content, without explanations.`;

  const userPrompt = `Original document:\n\n${content}\n\nInstructions: ${instructions}\n\nPlease revise the document accordingly.`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'MarkdownMyWords'
    },
    body: JSON.stringify({
      model: 'openai/gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 4000
    })
  });

  const data: OpenRouterResponse = await response.json();
  return data.choices[0].message.content;
}
```

### Suggest Content

```typescript
async function suggestContent(
  context: string,
  prompt: string
): Promise<string[]> {
  const systemPrompt = `You are a writing assistant. Generate multiple content suggestions based on the context and user's prompt. Return 3-5 suggestions, each on a new line.`;

  const userPrompt = `Context:\n\n${context}\n\nUser request: ${prompt}\n\nGenerate content suggestions.`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'MarkdownMyWords'
    },
    body: JSON.stringify({
      model: 'openai/gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.9,
      max_tokens: 1000
    })
  });

  const data: OpenRouterResponse = await response.json();
  return data.choices[0].message.content.split('\n').filter(s => s.trim());
}
```

## Model Selection

### Recommended Models

1. **GPT-4** (`openai/gpt-4`)
   - Best quality, higher cost
   - Use for: Review, complex revisions

2. **GPT-3.5 Turbo** (`openai/gpt-3.5-turbo`)
   - Good balance of quality and cost
   - Use for: Suggestions, simple revisions

3. **Claude** (`anthropic/claude-3-opus`)
   - Alternative high-quality model
   - Use for: Review, revisions

### Model Configuration

```typescript
interface ModelConfig {
  name: string;
  provider: string;
  maxTokens: number;
  costPer1kTokens: number;
  useCase: 'review' | 'revise' | 'suggest';
}

const modelConfigs: ModelConfig[] = [
  {
    name: 'openai/gpt-4',
    provider: 'OpenAI',
    maxTokens: 8000,
    costPer1kTokens: 0.03,  // Approximate
    useCase: 'review'
  },
  {
    name: 'openai/gpt-3.5-turbo',
    provider: 'OpenAI',
    maxTokens: 4000,
    costPer1kTokens: 0.002,
    useCase: 'suggest'
  }
];
```

## Cost Management

### Cost Estimation

```typescript
async function estimateCost(
  model: string,
  promptTokens: number,
  estimatedCompletionTokens: number
): Promise<number> {
  const config = modelConfigs.find(c => c.name === model);
  if (!config) {
    throw new Error('Unknown model');
  }

  const totalTokens = promptTokens + estimatedCompletionTokens;
  const cost = (totalTokens / 1000) * config.costPer1kTokens;
  return cost;
}
```

### Usage Tracking

```typescript
interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  estimatedCost: number;
  requestsByModel: Record<string, number>;
}

class UsageTracker {
  private stats: UsageStats = {
    totalRequests: 0,
    totalTokens: 0,
    estimatedCost: 0,
    requestsByModel: {}
  };

  trackRequest(model: string, usage: { total_tokens: number }) {
    this.stats.totalRequests++;
    this.stats.totalTokens += usage.total_tokens;
    this.stats.requestsByModel[model] =
      (this.stats.requestsByModel[model] || 0) + 1;

    const config = modelConfigs.find(c => c.name === model);
    if (config) {
      this.stats.estimatedCost +=
        (usage.total_tokens / 1000) * config.costPer1kTokens;
    }
  }

  getStats(): UsageStats {
    return { ...this.stats };
  }

  reset() {
    this.stats = {
      totalRequests: 0,
      totalTokens: 0,
      estimatedCost: 0,
      requestsByModel: {}
    };
  }
}
```

## Error Handling

```typescript
interface LLMError {
  code: 'rate_limit' | 'invalid_key' | 'model_error' | 'network_error' | 'unknown';
  message: string;
  retryAfter?: number;  // Seconds
}

async function handleLLMError(error: any): Promise<LLMError> {
  if (error.status === 429) {
    return {
      code: 'rate_limit',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: parseInt(error.headers.get('retry-after') || '60')
    };
  }

  if (error.status === 401) {
    return {
      code: 'invalid_key',
      message: 'Invalid API key. Please check your OpenRouter API key.'
    };
  }

  if (error.status >= 500) {
    return {
      code: 'model_error',
      message: 'Model service error. Please try again.'
    };
  }

  return {
    code: 'unknown',
    message: error.message || 'An unknown error occurred'
  };
}
```

## Rate Limiting

```typescript
class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 10, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  canMakeRequest(): boolean {
    const now = Date.now();
    this.requests = this.requests.filter(
      time => now - time < this.windowMs
    );
    return this.requests.length < this.maxRequests;
  }

  recordRequest() {
    this.requests.push(Date.now());
  }

  getWaitTime(): number {
    if (this.canMakeRequest()) {
      return 0;
    }
    const oldest = Math.min(...this.requests);
    return this.windowMs - (Date.now() - oldest);
  }
}
```

## API Key Management

### Storage

```typescript
// Encrypt API key with user's derived key
async function storeApiKey(apiKey: string, userKey: CryptoKey) {
  const encrypted = await encryptDocument(apiKey, userKey);
  await gun.get(`user~${userId}`).get('settings').get('openRouterApiKey').put(encrypted);
}

// Retrieve and decrypt API key
async function getApiKey(userKey: CryptoKey): Promise<string | null> {
  const encrypted = await gun.get(`user~${userId}`).get('settings').get('openRouterApiKey').once();
  if (!encrypted) {
    return null;
  }
  return await decryptDocument(encrypted, userKey);
}
```

### Validation

```typescript
async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

## UI Integration

### AI Sidebar Component

```typescript
interface AISidebarProps {
  documentContent: string;
  onApplySuggestion: (content: string) => void;
  apiKey: string;
}

function AISidebar({ documentContent, onApplySuggestion, apiKey }: AISidebarProps) {
  const [reviewing, setReviewing] = useState(false);
  const [revising, setRevising] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [results, setResults] = useState<ReviewResult | null>(null);

  const handleReview = async () => {
    setReviewing(true);
    try {
      const result = await reviewDocument(documentContent);
      setResults(result);
    } catch (error) {
      // Handle error
    } finally {
      setReviewing(false);
    }
  };

  // ... other handlers

  return (
    <div className="ai-sidebar">
      <h3>AI Assistant</h3>
      <button onClick={handleReview} disabled={reviewing}>
        {reviewing ? 'Reviewing...' : 'Review Document'}
      </button>
      {/* Display results */}
    </div>
  );
}
```

## Implementation Checklist

- [ ] OpenRouter API client implementation
- [ ] Review document functionality
- [ ] Revise document functionality
- [ ] Suggest content functionality
- [ ] Cost estimation
- [ ] Usage tracking
- [ ] Error handling
- [ ] Rate limiting
- [ ] API key storage (encrypted)
- [ ] API key validation
- [ ] UI components for AI features
- [ ] Model selection UI
- [ ] Cost display to user
