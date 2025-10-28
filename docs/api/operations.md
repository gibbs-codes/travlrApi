# Operational Notes

This section captures behaviours that the UI can rely on for predictable flows.

## Background Orchestration

- `triggerOrchestrator: true` (default) kicks off agents immediately after trip
  creation. The orchestrator runs asynchronously; the UI should not wait for the
  initial response to finish.
- Agent statuses move through `pending → running → completed/failed`. Skipped
  agents (when `agentsToRun` omits them) are marked `skipped`.
- Poll `GET /api/trip/:tripId/status` every few seconds until all required
  agents report `completed`.

## Recommendation Lifecycle

1. **Initial fetch**: After status signals `completed`, call the appropriate
   recommendation endpoint. If agents are still running, expect the 400
   “Recommendations not ready” response—wait and retry.
2. **Selection**: Use `PUT .../select` to store the user’s preferred option. The
   API clears previous selections for that agent type before saving the new one.
3. **Refresh**: Rerun endpoints (`POST .../rerun`) reset the agent status to
   `pending`/`planning` and trigger a fresh orchestrator run. Previously selected
   recommendations remain until the agent completes and returns new data.

## Images & Booking Links

- Agents populate `recommendations[].images[]` with fully qualified URLs.
- `availability.bookingUrl` provides a deep link (e.g., Booking.com, Google
  Place URL, airline site). Always check for existence before rendering.

## Error Handling Strategy (UI)

- **400 validation errors**: Display inline form validation. Use the `details`
  array to highlight specific issues.
- **Agent not ready**: Treat as “loading”; show a retry/back-off message.
- **404**: Display a “Not found” state and offer navigation back to the trip
  list.
- **500/503**: Show a generic error with retry option. When possible, log the
  `error` message for debugging.

## Pagination & Filtering

- All list endpoints accept `limit` and `offset`. Defaults are `limit=10`,
  `offset=0`.
- Agent-specific filters can be combined. Unknown filters are ignored.

## Rate Limiting & Retries

- The API does not currently enforce rate limits, but the UI should debounce
  polling (e.g., 3–5 seconds between status checks).
- External APIs (Amadeus, RapidAPI, Google) may enforce their own limits. When
  the backend hits these limits it logs a warning and falls back to cached or
  mock data; the UI continues to receive valid responses.
