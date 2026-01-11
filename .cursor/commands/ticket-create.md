# /ticket-create

Create a new development ticket with full metadata.

## Usage
```
/ticket-create [title]
```

## Parameters
- **title** (optional): The ticket title. If not provided, will prompt.

## Workflow
1. Enter ticket title
2. Select complexity (simple, task_list, plan)
3. Select services (backend, frontend, etc.)
4. Enter estimate (optional)
5. Enter owner (optional)
6. Configure review requirements

## Example
```
/ticket-create Implement OAuth2 login
```

## Output
Creates a new ticket folder in `.tickets/` with:
- Request.md
- TaskList.md (if complexity > simple)
- Implementation_Plan.md (if complexity = plan)
- Discussion.md
- assets/ folder
