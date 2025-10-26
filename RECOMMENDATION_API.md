# Recommendation API Documentation

## Overview

The TravlrAPI now has dedicated controllers and routes for each recommendation type, providing granular control over flight, hotel, activity, and restaurant recommendations.

---

## Architecture

### File Structure

```
src/
├── controllers/
│   ├── recommendationController.js          # Base controller with shared logic
│   ├── flightRecommendationController.js    # Flight-specific operations
│   ├── hotelRecommendationController.js     # Hotel-specific operations
│   ├── activityRecommendationController.js  # Activity-specific operations
│   ├── restaurantRecommendationController.js # Restaurant-specific operations
│   └── tripController.js                    # Core trip CRUD (kept as-is)
├── routes/
│   ├── recommendations.js                    # NEW - All recommendation routes
│   └── trip.js                              # Existing trip routes
└── server.js                                # Updated with new routes
```

### Design Pattern

**Base Controller Pattern**: All recommendation controllers inherit from `BaseRecommendationController`, which provides:
- Trip validation
- Common filtering logic
- Selection management
- Agent re-execution
- Error handling

Each specific controller extends the base and adds type-specific filters and metadata.

---

## API Endpoints

### Base URL
All recommendation endpoints are under: `/api/recommendations/:tripId`

---

## Flight Recommendations

### Get All Flights
```
GET /api/recommendations/:tripId/flights
```

**Query Parameters:**
- `minRating` (float) - Minimum rating (0-5)
- `maxPrice` (float) - Maximum price
- `sortBy` (string) - Sort by: `price_asc`, `price_desc`, `duration`, `stops`, `departure_time`
- `limit` (int) - Results per page (default: 10)
- `offset` (int) - Pagination offset (default: 0)
- **Flight-specific:**
  - `maxStops` (int) - Maximum number of stops
  - `airline` (string) - Filter by airline name
  - `cabinClass` (string) - `economy`, `premium_economy`, `business`, `first`
  - `maxDuration` (string) - Maximum flight duration
  - `nonStopOnly` (boolean) - Only show non-stop flights

**Response:**
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "_id": "...",
        "name": "United 1234",
        "price": { "amount": 450, "currency": "USD" },
        "rating": { "score": 4.2, "reviewCount": 150 },
        "flightDetails": {
          "airline": "United Airlines",
          "flightNumber": "UA1234",
          "departure": {
            "airport": "JFK",
            "time": "09:00",
            "date": "2025-12-01"
          },
          "arrival": {
            "airport": "LAX",
            "time": "12:30",
            "date": "2025-12-01"
          },
          "duration": "6h 30m",
          "stops": 0,
          "cabin": "economy"
        }
      }
    ],
    "total": 15,
    "count": 10,
    "filters": { ... },
    "pagination": { ... }
  }
}
```

### Get Single Flight
```
GET /api/recommendations/:tripId/flights/:recommendationId
```

### Select Flight
```
PUT /api/recommendations/:tripId/flights/:recommendationId/select
```

**Body:**
```json
{
  "selectedBy": "user123",
  "rank": 1
}
```

### Re-run Flight Agent
```
POST /api/recommendations/:tripId/flights/rerun
```

**Body:**
```json
{
  "reason": "User wants more options"
}
```

---

## Hotel Recommendations

### Get All Hotels
```
GET /api/recommendations/:tripId/hotels
```

**Query Parameters:**
- `minRating`, `maxPrice`, `sortBy`, `limit`, `offset` (same as flights)
- **Hotel-specific:**
  - `hotelType` (string) - `hotel`, `resort`, `apartment`, `hostel`, `guesthouse`, `villa`
  - `minStarRating` (float) - Minimum star rating
  - `amenities` (string) - Comma-separated: `wifi,pool,gym`
  - `roomType` (string) - Room type filter
  - `distanceFromCenter` (float) - Maximum distance in km

**Response:**
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "_id": "...",
        "name": "Grand Hotel Downtown",
        "price": { "amount": 150, "currency": "USD", "priceType": "per_night" },
        "rating": { "score": 4.5, "reviewCount": 320 },
        "hotelDetails": {
          "type": "hotel",
          "amenities": ["wifi", "pool", "gym", "spa"],
          "roomType": "deluxe",
          "checkIn": "2025-12-01",
          "checkOut": "2025-12-05",
          "nightlyRate": 150,
          "totalNights": 4,
          "totalPrice": 600
        }
      }
    ]
  }
}
```

### Get Single Hotel
```
GET /api/recommendations/:tripId/hotels/:recommendationId
```

### Select Hotel
```
PUT /api/recommendations/:tripId/hotels/:recommendationId/select
```

### Re-run Hotel Agent
```
POST /api/recommendations/:tripId/hotels/rerun
```

---

## Activity Recommendations

### Get All Activities
```
GET /api/recommendations/:tripId/activities
```

**Query Parameters:**
- `minRating`, `maxPrice`, `sortBy`, `limit`, `offset` (same as flights)
- **Activity-specific:**
  - `category` (string) - `cultural`, `adventure`, `food`, `nature`, `art`
  - `maxDuration` (float) - Maximum duration in hours
  - `minDuration` (float) - Minimum duration in hours
  - `indoor` (boolean) - Indoor activities only
  - `skillLevel` (string) - `beginner`, `intermediate`, `advanced`
  - `ageAppropriate` (int) - Minimum age
  - `accessibility` (string) - Accessibility requirements

**Response:**
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "_id": "...",
        "name": "Museum of Modern Art Tour",
        "price": { "amount": 45, "currency": "USD", "priceType": "per_person" },
        "rating": { "score": 4.8, "reviewCount": 580 },
        "activityDetails": {
          "category": "cultural",
          "duration": "3 hours",
          "indoor": true,
          "skillLevel": "beginner",
          "minimumAge": 8,
          "groupSize": "2-15",
          "accessibility": ["wheelchair", "stroller"],
          "includesTransport": false,
          "includesMeals": false,
          "cancellationPolicy": "Free cancellation up to 24h"
        }
      }
    ]
  }
}
```

### Get Single Activity
```
GET /api/recommendations/:tripId/activities/:recommendationId
```

### Select Activity
```
PUT /api/recommendations/:tripId/activities/:recommendationId/select
```

### Re-run Activity Agent
```
POST /api/recommendations/:tripId/activities/rerun
```

---

## Restaurant Recommendations

### Get All Restaurants
```
GET /api/recommendations/:tripId/restaurants
```

**Query Parameters:**
- `minRating`, `maxPrice`, `sortBy`, `limit`, `offset` (same as flights)
- **Restaurant-specific:**
  - `cuisine` (string) - `Italian`, `Japanese`, `Mexican`, etc.
  - `priceRange` (string) - `$`, `$$`, `$$$`, `$$$$`
  - `dietaryRestrictions` (string) - Comma-separated: `vegetarian,vegan,gluten_free`
  - `features` (string) - Comma-separated: `outdoor_seating,romantic,family_friendly`
  - `mealType` (string) - `breakfast`, `lunch`, `dinner`
  - `reservationsRequired` (boolean) - Filter by reservation requirements
  - `openNow` (boolean) - Only show restaurants currently open

**Response:**
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "_id": "...",
        "name": "Sakura Sushi",
        "description": "Japanese restaurant at 654 Sushi Ave. Rating: 4.7/5. Average meal: USD 65.00 per person",
        "price": { "amount": 65, "currency": "USD", "priceType": "per_person" },
        "rating": { "score": 4.7, "reviewCount": 890 },
        "restaurantDetails": {
          "cuisine": "Japanese",
          "priceRange": "$$$",
          "averageMealCost": 65,
          "features": ["sushi_bar", "fresh_fish", "traditional"],
          "dietaryOptions": ["gluten_free", "vegan"],
          "hours": {
            "isOpen": true,
            "periods": [...]
          },
          "reservations": true,
          "dressCode": "casual",
          "parking": "street",
          "seatingOptions": ["indoor", "bar"],
          "placeId": "ChIJN1t..."
        }
      }
    ]
  }
}
```

### Get Single Restaurant
```
GET /api/recommendations/:tripId/restaurants/:recommendationId
```

### Select Restaurant
```
PUT /api/recommendations/:tripId/restaurants/:recommendationId/select
```

### Re-run Restaurant Agent
```
POST /api/recommendations/:tripId/restaurants/rerun
```

---

## Common Response Patterns

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message"
}
```

### Not Ready Response
When recommendations are still being generated:
```json
{
  "success": false,
  "error": "Recommendations not ready",
  "message": "Flight recommendations are still being generated",
  "agentStatus": {
    "status": "running",
    "startedAt": "2025-10-26T12:00:00Z",
    "completedAt": null
  }
}
```

---

## Usage Examples

### Example 1: Get Budget Flights
```bash
curl "https://api.travlr.com/api/recommendations/trip_123/flights?maxPrice=500&nonStopOnly=true&sortBy=price_asc&limit=5"
```

### Example 2: Get Hotels with Pool
```bash
curl "https://api.travlr.com/api/recommendations/trip_123/hotels?amenities=pool,wifi&minRating=4.0"
```

### Example 3: Get Family Activities
```bash
curl "https://api.travlr.com/api/recommendations/trip_123/activities?category=family&indoor=false&ageAppropriate=5"
```

### Example 4: Get Vegetarian Restaurants
```bash
curl "https://api.travlr.com/api/recommendations/trip_123/restaurants?dietaryRestrictions=vegetarian&priceRange=$$&sortBy=rating"
```

### Example 5: Select a Flight
```bash
curl -X PUT "https://api.travlr.com/api/recommendations/trip_123/flights/rec_456/select" \
  -H "Content-Type: application/json" \
  -d '{"selectedBy": "user123", "rank": 1}'
```

### Example 6: Re-run Hotel Search
```bash
curl -X POST "https://api.travlr.com/api/recommendations/trip_123/hotels/rerun" \
  -H "Content-Type: application/json" \
  -d '{"reason": "User wants more luxury options"}'
```

---

## Migration from Old API

### Old Endpoints (Still Work)
```
GET /api/trip/:tripId - Returns trip with ALL recommendations
PUT /api/trip/:tripId/select - Bulk selection for all types
POST /api/trip/:tripId/rerun - Re-run all agents
```

### New Endpoints (Recommended)
```
GET /api/recommendations/:tripId/flights - Get only flights
PUT /api/recommendations/:tripId/flights/:id/select - Select specific flight
POST /api/recommendations/:tripId/flights/rerun - Re-run only flight agent
```

**Benefits of New API:**
- Smaller, faster responses
- Type-specific filtering
- Granular agent control
- Better mobile performance

---

## Benefits of Modular Design

1. **Performance**: Fetch only what you need (flights, hotels, etc.)
2. **Flexibility**: Each type has custom filters
3. **Scalability**: Easy to add new recommendation types
4. **Maintainability**: Isolated, testable controllers
5. **User Experience**: Faster page loads, better filtering

---

## Next Steps

### Planned Features
- [ ] Comparison endpoint: Compare 2+ recommendations side-by-side
- [ ] Favorites: Save recommendations for later
- [ ] Sharing: Share specific recommendations
- [ ] Alternative suggestions: Get similar options
- [ ] Price alerts: Notify when prices drop

### Testing
```bash
# Run tests for recommendation controllers
npm test -- --grep "RecommendationController"

# Test specific controller
npm test -- --grep "FlightRecommendationController"
```

---

## Support

For questions or issues:
- GitHub: https://github.com/anthropics/travlr-api/issues
- Docs: https://docs.travlr.com/api/recommendations
