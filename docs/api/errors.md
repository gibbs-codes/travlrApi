# Error Handling & Conventions

All Travlr API responses follow a consistent envelope:

```json
{
  "success": false,
  "error": "Human-readable summary",
  "message": "Optional user-facing message",
  "details": [ "Optional array of validation issues" ],
  "timestamp": "2025-04-10T11:00:00.000Z"
}
```

Success responses include `success: true`, `data`, `message`, and `timestamp`.

## HTTP Status Codes

| Status | Description | Typical Scenarios |
| --- | --- | --- |
| 200 | OK | Successful GET/PUT/POST operations |
| 201 | Created | Trip creation |
| 400 | Bad Request | Validation failures, agent not ready |
| 404 | Not Found | Trip or recommendation not found |
| 409 | Conflict | Duplicate entries (e.g., unique index violations) |
| 500 | Internal Server Error | Unexpected failures |
| 503 | Service Unavailable | Downstream dependency unavailable |

## Validation Errors

Validation middleware returns 400 with details:

```json
{
  "success": false,
  "error": "Validation failed",
  "message": "Please check your input and try again",
  "details": [
    "destination is required",
    "travelers must be between 1 and 20"
  ]
}
```

## Agent Not Ready

While agents are still running, recommendation endpoints respond with 400:

```json
{
  "success": false,
  "error": "Recommendations not ready",
  "message": "Activity recommendations are still being generated",
  "agentStatus": {
    "status": "running",
    "startedAt": "2025-04-10T10:50:12.000Z"
  }
}
```

The UI should continue polling the status endpoint and retry once the agent
status is `completed`.

## Not Found

Trips or recommendations that do not exist return 404:

```json
{
  "success": false,
  "error": "Trip not found",
  "message": "Trip with ID trip_invalid does not exist"
}
```

## Server Errors

Unhandled exceptions return 500 with the error message. Stack traces are only
included when `NODE_ENV=development`.

```json
{
  "success": false,
  "error": "Internal server error",
  "message": "An unexpected error occurred. Please try again later."
}
```

## Rerun Feedback

When rerunning agents, the API returns 200 immediately with status context:

```json
{
  "success": true,
  "data": {
    "tripId": "trip_1712419475123_zr3fl9xwq",
    "retriggeredAgents": ["restaurant"],
    "status": "planning",
    "reason": "User requested more options"
  },
  "message": "Agents rerun initiated successfully"
}
```

The UI should transition back to polling mode to await new recommendations.
