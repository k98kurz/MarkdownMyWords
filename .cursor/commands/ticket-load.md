# /ticket [TICKET-XXX]

Load ticket context into the conversation.

## Usage
```
/ticket TICKET-001
```

## Parameters
- **ticketId**: The ticket ID to load (e.g., TICKET-001)

## What's Loaded
- Request.md (first 50 lines)
- TaskList.md (first 50 lines)
- Implementation_Plan.md (first 50 lines)
- Discussion.md (first 50 lines)

## Example
```
/ticket TICKET-009
```

## MCP Alternative
Use the `ticket_load` MCP tool for programmatic access.
