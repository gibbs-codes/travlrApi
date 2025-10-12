# TravlrAPI - MVP Simplified API

**Version**: MVP 1.0  
**Base URL**: `http://localhost:3000`  
**Format**: All endpoints return JSON with `{success, data, message}` format

## Overview

The TravlrAPI MVP provides a simplified, focused API surface with exactly **6 endpoints** for trip creation, management, and agent coordination. Legacy endpoints have been removed to reduce complexity and improve maintainability.

## Core MVP Endpoints

### 1. Health Check
**GET** `/health`

Check server and database status.

**Response:**
```json
{
  "status": "OK",
  "message": "Server is running", 
  "database": {
    "isConnected": true,
    "readyState": 1,
    "host": "localhost",
    "port": 27017,
    "name": "travlrapi"
  }
}
```

### 2. Create Trip
**POST** `/api/trip/create`

Create a new trip with orchestrator trigger for agent execution.

**Request Body:**
```json
{
  "title": "Trip to Paris",
  "destination": "Paris",
  "origin": "New York",
  "departureDate": "2025-12-15",
  "returnDate": "2025-12-20",
  "travelers": {
    "count": 2,
    "adults": 2,
    "children": 0,
    "infants": 0
  },
  "preferences": {
    "interests": ["cultural", "food"],
    "budget": {
      "total": 2000,
      "currency": "USD",
      "breakdown": {
        "flight": 800,
        "accommodation": 600,
        "food": 400,
        "activities": 200
      }
    },
    "accommodation": {
      "type": "hotel",
      "minRating": 4
    },
    "transportation": {
      "flightClass": "economy",
      "preferNonStop": true
    }
  },
  "collaboration": {
    "createdBy": "user123"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tripId": "trip_1758349943478_2fq39bbwr",
    "status": "planning",
    "title": "Trip to Paris",
    "destination": "Paris",
    "origin": "New York",
    "dates": {
      "departureDate": "2025-12-15T00:00:00.000Z",
      "returnDate": "2025-12-20T00:00:00.000Z",
      "duration": 5
    },
    "travelers": {
      "count": 2,
      "adults": 2,
      "children": 0,
      "infants": 0
    },
    "agentExecution": {
      "status": "pending",
      "agents": {
        "flight": { "status": "pending", "recommendationCount": 0 },
        "accommodation": { "status": "pending", "recommendationCount": 0 },
        "activity": { "status": "pending", "recommendationCount": 0 },
        "restaurant": { "status": "pending", "recommendationCount": 0 },
        "transportation": { "status": "pending", "recommendationCount": 0 }
      }
    }
  },
  "message": "Trip created successfully, planning in progress"
}
```

### 3. Get Trip Details
**GET** `/api/trip/:tripId`

Retrieve full trip details including all recommendations.

**Response:**
```json
{
  "success": true,
  "data": {
    "tripId": "trip_1758349943478_2fq39bbwr",
    "title": "Trip to Paris",
    "destination": {
      "name": "Paris",
      "country": "France"
    },
    "origin": {
      "name": "New York",
      "country": "USA"
    },
    "dates": {
      "departureDate": "2025-12-15T00:00:00.000Z",
      "returnDate": "2025-12-20T00:00:00.000Z",
      "duration": 5
    },
    "travelers": {
      "count": 2,
      "adults": 2,
      "children": 0,
      "infants": 0
    },
    "recommendations": {
      "flight": [...],
      "accommodation": [...],
      "activity": [...],
      "restaurant": [...],
      "transportation": [...]
    },
    "selectedRecommendations": {
      "flight": [...],
      "accommodation": [...]
    },
    "status": "recommendations_ready",
    "totalRecommendations": 15,
    "totalSelectedRecommendations": 2
  },
  "message": "Trip retrieved successfully"
}
```

### 4. Get Trip Status
**GET** `/api/trip/:tripId/status`

Get real-time execution status and agent progress.

**Response:**
```json
{
  "success": true,
  "data": {
    "tripId": "trip_1758349943478_2fq39bbwr",
    "overallStatus": "in_progress",
    "progressPercentage": 60,
    "agents": {
      "flight": "completed",
      "accommodation": "completed", 
      "activity": "running",
      "restaurant": "pending",
      "transportation": "pending"
    },
    "executionMetrics": {
      "startedAt": "2025-09-20T06:32:00.000Z",
      "estimatedCompletion": "2025-09-20T06:35:00.000Z",
      "totalRecommendations": 12
    }
  },
  "message": "Trip status retrieved successfully"
}
```

### 5. Select Recommendations
**PUT** `/api/trip/:tripId/select`

Update user's recommendation selections.

**Request Body:**
```json
{
  "selections": {
    "flight": ["rec_flight_123"],
    "accommodation": ["rec_hotel_456", "rec_hotel_789"],
    "activity": ["rec_activity_101"]
  },
  "selectedBy": "user123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tripId": "trip_1758349943478_2fq39bbwr",
    "selectedRecommendations": {
      "flight": [
        {
          "recommendation": "rec_flight_123",
          "selectedAt": "2025-09-20T06:35:00.000Z",
          "selectedBy": "user123"
        }
      ],
      "accommodation": [...],
      "activity": [...]
    },
    "status": "user_selecting"
  },
  "message": "Selections updated successfully"
}
```

### 6. Rerun Agents (Optional)
**POST** `/api/trip/:tripId/rerun`

Trigger selective or full agent re-execution.

**Request Body:**
```json
{
  "agents": ["flight", "accommodation"],
  "reason": "User requested better options"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tripId": "trip_1758349943478_2fq39bbwr",
    "retriggeredAgents": ["flight", "accommodation"],
    "status": "planning"
  },
  "message": "Agents retriggered successfully, execution starting"
}
```

## Trip Status Values

| Status | Description |
|--------|-------------|
| `draft` | Trip created but not yet processed |
| `planning` | Agents are running/executing |
| `recommendations_ready` | All agents completed, recommendations available |
| `user_selecting` | User is making selections |
| `finalized` | User has completed selections |
| `cancelled` | Trip was cancelled |

## Agent Status Values

| Status | Description |
|--------|-------------|
| `pending` | Agent not yet started |
| `running` | Agent currently executing |
| `completed` | Agent finished successfully |
| `failed` | Agent encountered an error |
| `skipped` | Agent was skipped |

## Error Responses

All endpoints return consistent error format:

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    "departureDate cannot be in the past",
    "travelers.count must be at least 1"
  ],
  "message": "Please check your input and try again"
}
```

## Common HTTP Status Codes

- `200` - Success
- `400` - Bad Request (validation errors)
- `404` - Trip not found
- `500` - Internal server error

## Testing

Use the provided test suite to validate all endpoints:

```bash
node test-api-mvp.js
```

The test suite validates:
- ✅ All 6 MVP endpoints work correctly
- ✅ Legacy endpoints return 404 (properly removed)
- ✅ Request/response formats are consistent
- ✅ Error handling works as expected

## Removed Legacy Endpoints

The following endpoints have been **removed** in the MVP:

- ~~POST /api/trip/plan~~ → Use `/api/trip/create`
- ~~PATCH /api/trip/:tripId/selections~~ → Use `/api/trip/:tripId/select`
- ~~POST /api/trip/:tripId/retrigger~~ → Use `/api/trip/:tripId/rerun`
- ~~GET /api/trip/agents/status~~ → Not needed for MVP
- ~~GET /api/trip/user~~ → Move to collaboration endpoints later
- ~~GET /api/trip/:tripId/agents~~ → Agent details not needed for MVP

## Frontend Development Notes

1. **Polling**: Use `/api/trip/:tripId/status` to poll for agent execution progress
2. **Real-time Updates**: Consider WebSocket implementation for live status updates
3. **Error Handling**: All endpoints return consistent error format
4. **Validation**: Client-side validation should match server-side rules
5. **Trip ID Storage**: Store `tripId` from creation response for subsequent calls

## Database Models

- **Trip**: Core trip data with nested preferences and agent execution tracking
- **Recommendation**: Individual agent recommendations with confidence scoring
- **Relationships**: Trip → Recommendations (populated on demand)

This simplified API provides all essential functionality for the MVP while maintaining clean, predictable interfaces for frontend development.