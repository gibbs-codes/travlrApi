# Trip Lifecycle Endpoints

This document covers the core trip management routes under `POST/GET /api/trip`.
Use these endpoints to create trips, monitor orchestration, and manage high-level
metadata.

## POST `/api/trip/create`

Creates a trip and (optionally) triggers the background agent orchestrator.

### Request Body

```json
{
  "title": "Trip to Paris",
  "destination": "Paris",
  "origin": "New York",
  "departureDate": "2025-05-01",
  "returnDate": "2025-05-08",
  "travelers": 2,
  "interests": ["food", "cultural"],
  "preferences": {
    "accommodationType": "hotel",
    "minHotelRating": 4,
    "requiredAmenities": ["wifi"],
    "flightClass": "economy",
    "preferNonStop": true,
    "cuisines": ["french"]
  },
  "createdBy": "user123",
  "triggerOrchestrator": true,
  "agentsToRun": ["flight", "accommodation", "activity", "restaurant"]
}
```

- `travelers` accepts either a number or an object with `count`, `adults`, etc.
- `agentsToRun` is optional; defaults to all agents when omitted.
- `triggerOrchestrator` defaults to `true`. Set to `false` to create a draft.

### Success Response (201)

```json
{
  "success": true,
  "data": {
    "tripId": "trip_1712419475123_zr3fl9xwq",
    "title": "Trip to Paris",
    "status": "planning",
    "destination": {
      "name": "Paris",
      "country": null
    },
    "origin": {
      "name": "New York",
      "country": null
    },
    "dates": {
      "departureDate": "2025-05-01",
      "returnDate": "2025-05-08",
      "duration": 7
    },
    "travelers": {
      "count": 2,
      "adults": 2,
      "children": 0,
      "infants": 0
    },
    "agentExecution": {
      "status": "pending",
      "estimatedCompletion": "2025-05-01T12:34:56.000Z"
    }
  },
  "message": "Trip created successfully. Generating recommendations..."
}
```

### Behaviour Notes

- The orchestrator runs asynchronously after the 201 response. UI should poll
  `GET /api/trip/:tripId/status` to monitor progress.
- Validation errors return HTTP 400 with `details` describing missing/invalid
  fields.
- Unexpected server errors respond with HTTP 500 and `success: false`.

---

## GET `/api/trip/:tripId`

Returns the full trip document, including any stored recommendations.

### Success Response

```json
{
  "success": true,
  "data": {
    "tripId": "trip_1712419475123_zr3fl9xwq",
    "title": "Trip to Paris",
    "status": "recommendations_ready",
    "destination": { "name": "Paris" },
    "origin": { "name": "New York" },
    "dates": { "departureDate": "2025-05-01T00:00:00.000Z", "returnDate": "2025-05-08T00:00:00.000Z", "duration": 7 },
    "travelers": { "count": 2, "adults": 2, "children": 0, "infants": 0 },
    "preferences": {
      "interests": ["food", "cultural"],
      "accommodation": { "type": "hotel", "minRating": 4, "requiredAmenities": ["wifi"] },
      "transportation": { "flightClass": "economy", "preferNonStop": true, "localTransport": "mixed" },
      "dining": { "dietaryRestrictions": [], "cuisinePreferences": ["french"] },
      "accessibility": {}
    },
    "recommendations": {
      "flight": ["6623c9f9f6e2c31d4af3d105"],
      "accommodation": ["6623c9f9f6e2c31d4af3d10c"],
      "activity": [],
      "restaurant": []
    },
    "selectedRecommendations": {
      "flight": [
        {
          "recommendation": "6623c9f9f6e2c31d4af3d105",
          "selectedAt": "2025-04-10T10:42:11.219Z",
          "selectedBy": "user123",
          "selectionRank": 1
        }
      ]
    },
    "agentExecution": {
      "status": "completed",
      "agents": {
        "flight": { "status": "completed", "recommendationCount": 3 },
        "accommodation": { "status": "completed", "recommendationCount": 3 },
        "activity": { "status": "running" },
        "restaurant": { "status": "pending" }
      }
    }
  },
  "message": "Trip metadata retrieved successfully"
}
```

### Behaviour Notes

- Recommendation arrays contain MongoDB ObjectIds. Use the recommendation
  endpoints to fetch detailed cards.
- Status values of interest: `planning`, `recommendations_ready`, `user_selecting`,
  `finalized`, `failed`.

---

## GET `/api/trip/:tripId/status`

Returns a lightweight status snapshot for polling UIs.

```json
{
  "success": true,
  "data": {
    "tripId": "trip_1712419475123_zr3fl9xwq",
    "status": "planning",
    "execution": {
      "status": "in_progress",
      "startedAt": "2025-04-10T10:41:00.123Z",
      "agents": {
        "flight": { "status": "completed", "recommendationCount": 3 },
        "accommodation": { "status": "completed", "recommendationCount": 3 },
        "activity": { "status": "running", "recommendationCount": 0 },
        "restaurant": { "status": "pending", "recommendationCount": 0 }
      }
    },
    "recommendationCounts": {
      "flight": 3,
      "accommodation": 3,
      "activity": 0,
      "restaurant": 0
    },
    "lastUpdated": "2025-04-10T10:41:32.522Z"
  }
}
```

- When agents are not finished, per-agent recommendation routes return HTTP 400
  with `error: "Recommendations not ready"`.

---

## PUT `/api/trip/:tripId/select`

Legacy endpoint to select recommendations in bulk. Prefer the per-agent
selection endpoints described in [Recommendation Endpoints](recommendations.md).

**Payload**:

```json
{
  "selections": {
    "flight": ["<recommendationId>"],
    "accommodation": ["<recommendationId>"]
  },
  "selectedBy": "user123"
}
```

---

## POST `/api/trip/:tripId/rerun`

Re-runs one or more agents for an existing trip.

**Payload**:

```json
{
  "agents": ["activity", "restaurant"],
  "reason": "User requested fresh options",
  "resetSelections": true
}
```

Response confirms the rerun request and immediately returns; the orchestrator
works in the background as with initial creation.

---

## POST `/api/trip/:tripId/agents/start`

Starts specific agents for an existing trip (e.g., when the trip was created as
a draft with `triggerOrchestrator: false`).

**Payload**:

```json
{
  "agents": ["activity", "restaurant"],
  "reason": "User requested additional experiences"
}
```

Returns 200 when the orchestrator has been queued.
