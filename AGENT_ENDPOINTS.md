# Agent Execution Endpoints - Quick Reference

## Individual Agent Endpoints (RECOMMENDED)

Run or rerun individual agents independently:

```
POST /api/trip/:tripId/agent/flight
POST /api/trip/:tripId/agent/flight/rerun

POST /api/trip/:tripId/agent/accommodation
POST /api/trip/:tripId/agent/accommodation/rerun

POST /api/trip/:tripId/agent/activity
POST /api/trip/:tripId/agent/activity/rerun

POST /api/trip/:tripId/agent/restaurant
POST /api/trip/:tripId/agent/restaurant/rerun
```

**Request Body (optional):**
```json
{
  "reason": "optional reason for logging"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tripId": "trip_123",
    "agentType": "flight",
    "status": "pending",
    "message": "Flight agent rerun initiated"
  }
}
```

**Behavior:**
- Both `/agent/flight` and `/agent/flight/rerun` work identically
- Runs agent in background (returns immediately)
- Only blocks if overall execution status is `in_progress`
- Clears previous recommendations before running
- Works for first run or subsequent reruns

---

## Create Trip (Draft Mode)

```
POST /api/trip/create
```

**Request:**
```json
{
  "destination": "Paris",
  "origin": "New York",
  "departureDate": "2024-03-15",
  "returnDate": "2024-03-20",
  "travelers": 2,
  "triggerOrchestrator": false
}
```

**Best Practice:**
- Always use `triggerOrchestrator: false` for draft mode
- Agents start in `idle` state
- User manually triggers each agent via individual endpoints

---

## Check Agent Status

```
GET /api/trip/:tripId
```

**Response includes:**
```json
{
  "agentExecution": {
    "status": "completed",
    "agents": {
      "flight": {
        "status": "completed",
        "confidence": 0.85,
        "recommendationCount": 5,
        "errors": []
      },
      "accommodation": {
        "status": "idle"
      }
    }
  }
}
```

**Agent Statuses:** `idle`, `pending`, `running`, `completed`, `failed`, `skipped`

---

## Get Recommendations

```
GET /api/trip/:tripId/recommendations/flights
GET /api/trip/:tripId/recommendations/hotels
GET /api/trip/:tripId/recommendations/experiences
GET /api/trip/:tripId/recommendations/restaurants
```

**Returns:** Array of recommendations for that agent type

---

## Typical UI Flow (RECOMMENDED)

1. **Create draft trip:**
   ```
   POST /api/trip/create with triggerOrchestrator: false
   ```

2. **User clicks "Get Flight Recommendations":**
   ```
   POST /api/trip/:tripId/agent/flight
   ```

3. **Poll for status:**
   ```
   GET /api/trip/:tripId (check agentExecution.agents.flight.status)
   ```

4. **When status is 'completed', fetch recommendations:**
   ```
   GET /api/trip/:tripId/recommendations/flights
   ```

5. **User clicks "Rerun Flight Search":**
   ```
   POST /api/trip/:tripId/agent/flight/rerun
   ```

6. **Repeat for other agents independently**

---

## Legacy Endpoints (Still Supported)

**Batch agent start:**
```
POST /api/trip/:tripId/start-agents
Body: { "agents": ["flight", "accommodation"] }
```

**Not recommended** - Use individual agent endpoints instead for better control.
