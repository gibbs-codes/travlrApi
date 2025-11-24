# TravlrApi Backend Architecture

## Overview
TravlrApi is an AI-powered travel planning backend built with Node.js, Express, and MongoDB. It uses specialized AI agents to generate personalized travel recommendations for flights, accommodations, activities, and restaurants.

## Tech Stack
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Database**: MongoDB (Mongoose ODM)
- **AI Providers**: OpenAI, Ollama, Mock (configurable)
- **External APIs**: Amadeus (flights), Google Places (restaurants), Booking.com
- **Logging**: Winston
- **Security**: Helmet, CORS, Rate Limiting

## Directory Structure

```
travlrApi/
├── src/
│   ├── agents/           # AI agents for different recommendation types
│   │   ├── baseAgent.js           # Base class for all agents
│   │   ├── tripOrchestrator.js    # Coordinates agent execution
│   │   ├── flightAgent.js         # Flight recommendations
│   │   ├── accommodationAgent.js  # Hotel/accommodation search
│   │   ├── activityAgent.js       # Things to do
│   │   ├── restaurantAgent.js     # Dining recommendations
│   │   └── transportationAgent.js # Local transport
│   │
│   ├── controllers/      # Request handlers
│   │   ├── tripController.js                      # Trip CRUD & agent execution
│   │   ├── travelController.js                    # Legacy travel endpoints
│   │   └── restaurantRecommendationController.js  # Restaurant-specific logic
│   │
│   ├── models/           # MongoDB schemas
│   │   ├── Trip.js              # Main trip document
│   │   ├── Recommendation.js    # Individual recommendations
│   │   └── index.js             # Model exports
│   │
│   ├── routes/           # API route definitions
│   │   ├── trip.js              # /api/trip/* endpoints
│   │   ├── travel.js            # /api/travel/* endpoints
│   │   └── recommendations.js   # /api/recommendations/* endpoints
│   │
│   ├── services/         # External service integrations
│   │   ├── database.js           # MongoDB connection management
│   │   ├── aiProvider.js         # AI provider abstraction (OpenAI/Ollama/Mock)
│   │   ├── amadeusService.js     # Amadeus flight API
│   │   ├── googlePlacesService.js # Google Places API
│   │   ├── bookingService.js     # Booking.com integration
│   │   ├── googleMapsService.js  # Google Maps utilities
│   │   ├── geographicService.js  # Location/geocoding
│   │   └── rapidApiService.js    # RapidAPI integrations
│   │
│   ├── middleware/       # Express middleware
│   │   ├── errorHandler.js           # Global error handling
│   │   ├── validation.js             # Request validation helpers
│   │   └── normalizeCreateTrip.js    # Trip creation normalization
│   │
│   ├── config/           # Configuration
│   │   ├── env.js        # Environment variable validation
│   │   └── database.js   # Database configuration
│   │
│   ├── utils/            # Utilities
│   │   └── logger.js     # Winston logger configuration
│   │
│   └── server.js         # Application entry point
│
├── test/                 # Test files
├── scripts/              # Utility scripts
├── docs/                 # Documentation
├── .env                  # Environment variables
└── package.json
```

## Core Concepts

### 1. Trip Lifecycle

**Trip Statuses:**
- `draft` - Trip created but agents not started
- `planning` - Agents are executing
- `recommendations_ready` - All agents completed successfully
- `user_selecting` - User is reviewing recommendations
- `finalized` - User has made final selections
- `cancelled` - Trip cancelled

**Agent Execution Statuses:**
- Overall: `pending`, `in_progress`, `completed`, `failed`, `partial`
- Individual agents: `idle`, `pending`, `running`, `completed`, `failed`, `skipped`

### 2. Agent System

**Agent Architecture:**
All agents extend `TripPlanningAgent` (from baseAgent.js) which provides:
- Standardized search interface
- AI provider integration
- Logging capabilities
- Error handling
- Mock data fallbacks

**Available Agents:**
1. **FlightAgent** - Uses Amadeus API for real flight data
2. **AccommodationAgent** - Uses Booking.com API
3. **ActivityAgent** - Generates activity recommendations
4. **RestaurantAgent** - Uses Google Places API
5. **TransportationAgent** - Local transport options

**Agent Execution Modes:**
- **Orchestrator Mode** (legacy): All agents run together via `TripOrchestrator`
- **Independent Mode** (new): Each agent runs independently via `executeAgentIndependently()`

### 3. Trip Creation Flow

```
POST /api/trip/create
  ↓
  1. Validate request (dates, destination, travelers, etc.)
  ↓
  2. Create Trip document with initial status
  ↓
  3. If triggerOrchestrator=true:
     - Set agent statuses to 'pending'
     - Execute agents immediately
     Else (draft mode):
     - Set agent statuses to 'idle'
     - Return trip without executing agents
  ↓
  4. Return trip data to client
```

### 4. Manual Agent Execution

```
POST /api/trip/:tripId/start-agents
Body: { agents: ['flight', 'accommodation'], reason: 'optional' }
  ↓
  1. Validate trip exists and not in_progress
  ↓
  2. Update requested agent statuses to 'pending'
  ↓
  3. For each agent:
     - executeAgentIndependently()
     - Update status to 'running'
     - Call agent.search(criteria)
     - Save recommendations to database
     - Update status to 'completed' or 'failed'
  ↓
  4. Return success response immediately (agents run in background)
```

### 5. Data Models

**Trip Model (src/models/Trip.js):**
```javascript
{
  tripId: String (unique),
  title: String,
  destination: { name, country, coordinates, placeId },
  origin: { name, country, coordinates, airportCode },
  dates: { departureDate, returnDate, duration },
  travelers: { count, adults, children, infants, details[] },
  preferences: {
    interests: [],
    accommodation: { type, minRating, requiredAmenities },
    transportation: { flightClass, preferNonStop, localTransport },
    dining: { dietaryRestrictions, cuisinePreferences },
    accessibility: { ... }
  },
  recommendations: {
    flight: [ObjectId],
    accommodation: [ObjectId],
    activity: [ObjectId],
    restaurant: [ObjectId]
  },
  selectedRecommendations: {
    flight: [{ recommendation, selectedAt, selectedBy }],
    // ... same for other types
  },
  agentExecution: {
    status: String,
    startedAt: Date,
    completedAt: Date,
    agents: {
      flight: { status, startedAt, completedAt, confidence, errors[] },
      // ... same for accommodation, activity, restaurant
    }
  },
  collaboration: { createdBy, collaborators[], isPublic },
  status: String,
  version: Number,
  tags: [],
  notes: String
}
```

**Recommendation Model (src/models/Recommendation.js):**
```javascript
{
  tripId: ObjectId,
  type: String ('flight'|'accommodation'|'activity'|'restaurant'),
  title: String,
  description: String,
  provider: String,
  price: { amount, currency },
  rating: Number,
  images: [String],
  metadata: Mixed (type-specific data),
  confidence: Number,
  selected: Boolean,
  selectedAt: Date
}
```

## Key API Endpoints

### Trip Management
- `POST /api/trip/create` - Create new trip (draft or with agents)
- `GET /api/trip/:tripId` - Get trip details with recommendations
- `PUT /api/trip/:tripId` - Update trip details
- `DELETE /api/trip/:tripId` - Delete trip
- `GET /api/trip/user/:userId` - Get all trips for a user

### Agent Control
- `POST /api/trip/:tripId/start-agents` - Manually trigger specific agents
- `POST /api/trip/:tripId/rerun-agents` - Rerun agents with reset options
- `GET /api/trip/:tripId/agents/status` - Get agent execution status

### Recommendations
- `GET /api/trip/:tripId/recommendations` - Get all recommendations
- `GET /api/trip/:tripId/recommendations/:type` - Get recommendations by type
- `POST /api/trip/:tripId/select/:recommendationId` - Select a recommendation
- `DELETE /api/trip/:tripId/select/:recommendationId` - Deselect a recommendation

### Health & Status
- `GET /health` - Health check endpoint
- `GET /api/status` - API status and version

## Environment Configuration

**.env Variables:**
```bash
# Server
PORT=3006
NODE_ENV=development|production

# Database
MONGODB_URI=mongodb://localhost:27017/travlrapi

# AI Provider
AI_PROVIDER=openai|ollama|mock
OPENAI_API_KEY=sk-...
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2

# External APIs
AMADEUS_CLIENT_ID=...
AMADEUS_CLIENT_SECRET=...
GOOGLE_PLACES_API_KEY=...
BOOKING_API_KEY=...

# Security
CORS_ORIGIN=*
JWT_SECRET=...

# Logging
LOG_LEVEL=debug|info|warn|error

# Development
MOCK_DELAY_MS=500
```

## Important Implementation Details

### Recent Changes (Nov 2024)
1. **Agent Status Refactor**: Added 'idle' status for draft trips
2. **Independent Agent Execution**: Agents now run independently instead of through orchestrator in startAgents endpoint
3. **Draft Trip Support**: Trips can be created without immediately executing agents
4. **Flexible Agent Triggering**: Can start specific agents on-demand

### Agent Execution Strategy
- **New trips with triggerOrchestrator=false**: Agents start in 'idle' state
- **Manual agent start**: Only blocks if status is 'in_progress' (not 'pending' or 'idle')
- **Independent execution**: Each agent runs in its own background process
- **Error handling**: Individual agent failures don't affect other agents

### Database Patterns
- All agents store recommendations in the `Recommendation` collection
- Trip document stores ObjectId references to recommendations
- Selected recommendations tracked separately in `selectedRecommendations`
- Agent execution metadata tracked in `agentExecution.agents.{agentName}`

### Logging Best Practices
```javascript
import logger from '../utils/logger.js';
const log = logger.child({ scope: 'ComponentName' });

log.info('Message', { metadata });
log.warn('Warning', { context });
log.error('Error', { error: error.message, stack: error.stack });
```

## Testing

**Run API Tests:**
```bash
npm test                    # Run basic API tests
npm run test:deployment     # Validate deployment readiness
node test-api.js           # Manual API testing
node test-models.js        # Test data models
```

## Common Patterns

### Creating a New Agent
1. Extend `TripPlanningAgent` in `src/agents/`
2. Implement `search(criteria)` method
3. Return `{ recommendations: [], confidence: 0-1 }`
4. Add to agent map in `tripController.js`
5. Update Trip model if needed

### Adding a New Endpoint
1. Create route handler in `src/routes/`
2. Implement controller logic in `src/controllers/`
3. Add validation middleware if needed
4. Update this documentation

### Integrating External API
1. Create service in `src/services/`
2. Add API keys to `.env` and `.env.example`
3. Implement error handling and fallbacks
4. Add to relevant agent(s)

## Troubleshooting

**Common Issues:**
- MongoDB connection errors → Check MONGODB_URI and MongoDB service
- Agent failures → Check API keys in .env
- CORS issues → Verify CORS_ORIGIN setting
- Empty recommendations → Check LOG_LEVEL=debug for agent logs

**Debug Mode:**
```bash
LOG_LEVEL=debug npm start
```

## Architecture Decisions

**Why Independent Agent Execution?**
- Allows granular control over which agents run
- Better error isolation
- Supports incremental recommendation generation
- Enables draft trips that users can customize before execution

**Why Separate Recommendation Collection?**
- Enables reuse across trips
- Simplifies querying and analytics
- Supports versioning and comparison
- Cleaner data model

**Why Mock AI Provider?**
- Development without API costs
- Faster testing cycles
- Consistent test data
- Offline development support

## Next Steps for UI Integration

When integrating with the UI, you'll need to:

1. **Create Trip Flow:**
   - Call `POST /api/trip/create` with `triggerOrchestrator: false` for drafts
   - Display trip details immediately
   - Allow user to trigger agents via `POST /api/trip/:tripId/start-agents`

2. **Poll for Updates:**
   - Use `GET /api/trip/:tripId` to check agent status
   - Show progress indicators for running agents
   - Update UI when agents complete

3. **Display Recommendations:**
   - Fetch via `GET /api/trip/:tripId/recommendations`
   - Group by type (flight, accommodation, activity, restaurant)
   - Show agent confidence scores

4. **Handle Selections:**
   - Call `POST /api/trip/:tripId/select/:recommendationId`
   - Update UI to show selected items
   - Allow multiple selections per category if needed

5. **Error States:**
   - Check `agentExecution.agents.{type}.errors[]` for failures
   - Show retry options via rerun-agents endpoint
   - Handle partial completion (some agents succeed, others fail)

## API Response Examples

**Trip Creation (Draft):**
```json
{
  "success": true,
  "data": {
    "tripId": "trip_1234567890_abc123",
    "status": "draft",
    "agentExecution": {
      "status": "pending",
      "agents": {
        "flight": { "status": "idle" },
        "accommodation": { "status": "idle" },
        "activity": { "status": "idle" },
        "restaurant": { "status": "idle" }
      }
    }
  }
}
```

**Start Agents Response:**
```json
{
  "success": true,
  "data": {
    "tripId": "trip_1234567890_abc123",
    "startedAgents": ["flight", "accommodation"],
    "status": "planning",
    "message": "Agents started successfully"
  }
}
```

**Trip with Recommendations:**
```json
{
  "success": true,
  "data": {
    "tripId": "trip_1234567890_abc123",
    "status": "recommendations_ready",
    "recommendations": {
      "flight": [
        {
          "_id": "rec_123",
          "type": "flight",
          "title": "Direct Flight to Paris",
          "price": { "amount": 450, "currency": "USD" },
          "metadata": { /* flight details */ }
        }
      ]
    },
    "agentExecution": {
      "status": "completed",
      "agents": {
        "flight": { "status": "completed", "confidence": 0.85, "recommendationCount": 5 }
      }
    }
  }
}
```
