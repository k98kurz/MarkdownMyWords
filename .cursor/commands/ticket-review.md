# /review [TICKET-XXX] [type]

Trigger a review workflow for a ticket.

## Usage
```
/review TICKET-001 start
/review TICKET-001 complete
```

## Parameters
- **ticketId**: The ticket ID to review
- **type**: Review type
  - `start`: Review plan before starting work
  - `complete`: Review work for completion

## Start Review
Checks:
- Requirements clarity
- Acceptance criteria
- Implementation plan readiness

## Complete Review
Checks:
- Task completion status
- Acceptance criteria met
- Implementation plan progress

## Actions
After review, you can:
- **Approve**: Move to next status
- **Request Changes**: Add notes, return to in_progress
- **Questions**: Log question, keep status

## MCP Alternative
Use the `ticket_review` MCP tool for programmatic access.
