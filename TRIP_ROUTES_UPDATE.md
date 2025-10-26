# Trip Routes Update - Modular Recommendation Endpoints

## Summary

Updated `src/routes/trip.js` to include new modular recommendation endpoints while maintaining backward compatibility with existing endpoints.

---

## All Available Endpoints

### **Core Trip Management (Existing - Unchanged)**

```
POST   /api/trip/create                    - Create trip with orchestrator trigger
GET    /api/trip/:tripId                   - Get full trip with ALL recommendations
PUT    /api/trip/:tripId/select            - Select recommendations for ALL types (legacy)
GET    /api/trip/:tripId/status            - Real-time execution status
POST   /api/trip/:tripId/rerun             - Re-run ALL agents (legacy)
```

### **Modular Recommendation Endpoints (NEW)**

#### **Flight Recommendations**
```
GET    /api/trip/:tripId/recommendations/flights         - Get flight recommendations
PUT    /api/trip/:tripId/recommendations/flights/select  - Select a flight
POST   /api/trip/:tripId/recommendations/flights/rerun   - Re-run flight agent
```

#### **Hotel Recommendations**
```
GET    /api/trip/:tripId/recommendations/hotels         - Get hotel recommendations
PUT    /api/trip/:tripId/recommendations/hotels/select  - Select a hotel
POST   /api/trip/:tripId/recommendations/hotels/rerun   - Re-run hotel agent
```

#### **Experience/Activity Recommendations**
```
GET    /api/trip/:tripId/recommendations/experiences         - Get activity recommendations
PUT    /api/trip/:tripId/recommendations/experiences/select  - Select an activity
POST   /api/trip/:tripId/recommendations/experiences/rerun   - Re-run activity agent
```

#### **Restaurant Recommendations**
```
GET    /api/trip/:tripId/recommendations/restaurants         - Get restaurant recommendations
PUT    /api/trip/:tripId/recommendations/restaurants/select  - Select a restaurant
POST   /api/trip/:tripId/recommendations/restaurants/rerun   - Re-run restaurant agent
```

---

## Usage Examples

### **Get Flight Recommendations with Filters**

```bash
GET /api/trip/trip_123/recommendations/flights?maxPrice=500&nonStopOnly=true&sortBy=price_asc

# Response
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "_id": "rec_abc",
        "name": "United 1234",
        "price": { "amount": 450, "currency": "USD" },
        "flightDetails": {
          "airline": "United Airlines",
          "stops": 0,
          "duration": "6h 30m"
        }
      }
    ],
    "total": 5,
    "count": 5,
    "filters": { "maxPrice": 500, "nonStopOnly": true }
  }
}
```

### **Select a Flight**

```bash
PUT /api/trip/trip_123/recommendations/flights/select
Content-Type: application/json

{
  "recommendationId": "rec_abc123",
  "selectedBy": "user123",
  "rank": 1
}

# Response
{
  "success": true,
  "data": {
    "tripId": "trip_123",
    "agentType": "flight",
    "recommendation": { ... },
    "selectedAt": "2025-10-26T12:00:00Z",
    "selectedBy": "user123"
  },
  "message": "Flight recommendation selected successfully"
}
```

### **Re-run Flight Agent**

```bash
POST /api/trip/trip_123/recommendations/flights/rerun
Content-Type: application/json

{
  "reason": "User wants more options"
}

# Response
{
  "success": true,
  "data": {
    "tripId": "trip_123",
    "agentType": "flight",
    "status": "pending",
    "reason": "User wants more options",
    "message": "Flight agent rerun initiated"
  },
  "message": "Flight recommendations will be regenerated"
}
```

### **Get Hotels with Amenities Filter**

```bash
GET /api/trip/trip_123/recommendations/hotels?amenities=pool,wifi&minRating=4.0&sortBy=price_asc

# Response
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "_id": "rec_xyz",
        "name": "Grand Hotel Downtown",
        "price": { "amount": 150, "currency": "USD", "priceType": "per_night" },
        "hotelDetails": {
          "type": "hotel",
          "amenities": ["wifi", "pool", "gym"],
          "nightlyRate": 150,
          "totalNights": 4,
          "totalPrice": 600
        }
      }
    ]
  }
}
```

### **Get Restaurants by Cuisine**

```bash
GET /api/trip/trip_123/recommendations/restaurants?cuisine=Italian&priceRange=$$&minRating=4.5

# Response
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "_id": "rec_rest1",
        "name": "Bella Italia",
        "description": "Italian restaurant at 123 Main St. Rating: 4.8/5. Average meal: USD 45.00 per person",
        "restaurantDetails": {
          "cuisine": "Italian",
          "priceRange": "$$",
          "averageMealCost": 45,
          "features": ["outdoor_seating", "romantic"],
          "reservations": true
        }
      }
    ]
  }
}
```

### **Get Activities by Category**

```bash
GET /api/trip/trip_123/recommendations/experiences?category=cultural&maxDuration=3&indoor=true

# Response
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "_id": "rec_act1",
        "name": "Museum of Modern Art Tour",
        "activityDetails": {
          "category": "cultural",
          "duration": "2.5 hours",
          "indoor": true,
          "skillLevel": "beginner",
          "minimumAge": 8
        }
      }
    ]
  }
}
```

---

## Migration Guide

### **Before (Legacy - Still Works)**

```javascript
// Get ALL recommendations at once
const response = await fetch(`/api/trip/${tripId}`);
const trip = await response.json();
const flights = trip.data.recommendations.flight;
const hotels = trip.data.recommendations.accommodation;
```

### **After (New - Recommended)**

```javascript
// Get only flights (faster, smaller response)
const flightResponse = await fetch(`/api/trip/${tripId}/recommendations/flights?maxPrice=500`);
const flights = await flightResponse.json();

// Get only hotels with filters
const hotelResponse = await fetch(`/api/trip/${tripId}/recommendations/hotels?amenities=pool`);
const hotels = await hotelResponse.json();
```

### **Benefits of New Approach**

1. **Performance**: Smaller, faster API responses
2. **Filtering**: Type-specific filters (flight stops, hotel amenities, etc.)
3. **Granular Control**: Re-run only the agent you need
4. **Mobile-Friendly**: Load recommendations on-demand as user scrolls
5. **Better UX**: Show loading states per recommendation type

---

## Request/Response Patterns

### **Select Endpoint Pattern**

All select endpoints expect the same request body:

```json
{
  "recommendationId": "rec_abc123",  // Required
  "selectedBy": "user123",            // Optional, defaults to "user"
  "rank": 1                           // Optional, defaults to 1
}
```

### **Rerun Endpoint Pattern**

All rerun endpoints expect the same request body:

```json
{
  "reason": "Why are you re-running this agent?"  // Optional
}
```

---

## Query Parameters by Type

### **Common (All Types)**
- `minRating` - Minimum rating (0-5)
- `maxPrice` - Maximum price
- `sortBy` - Sort order
- `limit` - Results per page (default: 10)
- `offset` - Pagination offset (default: 0)

### **Flights Only**
- `maxStops` - Max number of stops
- `airline` - Filter by airline
- `cabinClass` - Economy, business, etc.
- `nonStopOnly` - Boolean

### **Hotels Only**
- `hotelType` - Hotel, resort, apartment, etc.
- `amenities` - Comma-separated list
- `minStarRating` - Minimum stars
- `roomType` - Room type

### **Experiences Only**
- `category` - Cultural, adventure, food, etc.
- `maxDuration` - Max hours
- `minDuration` - Min hours
- `indoor` - Boolean
- `skillLevel` - Beginner, intermediate, advanced
- `ageAppropriate` - Minimum age

### **Restaurants Only**
- `cuisine` - Italian, Japanese, etc.
- `priceRange` - $, $$, $$$, $$$$
- `dietaryRestrictions` - Comma-separated
- `features` - Comma-separated
- `reservationsRequired` - Boolean

---

## Error Responses

### **Trip Not Found**
```json
{
  "success": false,
  "error": "Trip not found",
  "message": "Trip with ID trip_123 does not exist"
}
```

### **Recommendations Not Ready**
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

### **Invalid Recommendation**
```json
{
  "success": false,
  "error": "Invalid recommendation",
  "message": "Flight recommendation does not belong to this trip"
}
```

---

## Implementation Notes

### **Controllers Used**
- `flightRecommendationController.js` - Flight operations
- `hotelRecommendationController.js` - Hotel operations
- `activityRecommendationController.js` - Activity/experience operations
- `restaurantRecommendationController.js` - Restaurant operations

### **Base Controller**
All controllers inherit from `BaseRecommendationController` which provides:
- Trip validation
- Common filtering
- Selection management
- Agent re-execution
- Error handling

### **Route Pattern**
```javascript
router.get('/:tripId/recommendations/{type}', validateTripId, asyncHandler(getTypeRecommendations));
router.put('/:tripId/recommendations/{type}/select', validateTripId, asyncHandler(selectTypeRecommendation));
router.post('/:tripId/recommendations/{type}/rerun', validateTripId, asyncHandler(rerunTypeAgent));
```

---

## Next Steps

1. **Frontend Integration**: Update UI to use new endpoints
2. **Testing**: Test all new endpoints with various filters
3. **Documentation**: Update API docs for frontend team
4. **Analytics**: Track usage of new vs. old endpoints
5. **Deprecation**: Eventually deprecate `/select` and `/rerun` legacy endpoints

---

## Support

For questions:
- Check [RECOMMENDATION_API.md](RECOMMENDATION_API.md) for full API docs
- Review controller implementations in `src/controllers/`
- Test endpoints using the examples above
