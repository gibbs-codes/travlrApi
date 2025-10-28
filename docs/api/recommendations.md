# Recommendation Endpoints

Each agent type exposes REST endpoints for listing recommendations, fetching
single records, selecting choices, and re-running agents. Endpoints exist in two
namespaces:

1. `/api/trip/:tripId/recommendations/...` — Trip-aware routes with convenience
   wrappers (used by the UI right after trip creation).
2. `/api/recommendations/:tripId/...` — Direct access to recommendation data for
   each agent. Both route sets share the same controllers and response shapes.

## Common Response Shape

List endpoints return:

```json
{
  "success": true,
  "data": {
    "recommendations": [ /* array of recommendation documents */ ],
    "total": 3,
    "count": 3,
    "agentType": "flight",
    "filters": { /* query filters applied */ },
    "pagination": { "limit": 10, "offset": 0 }
  },
  "message": "Flight recommendations retrieved successfully",
  "timestamp": "2025-04-10T10:45:12.000Z"
}
```

Each recommendation document exposes:

- `price.amount`, `price.currency`, `price.priceType`
- `rating.score`, `rating.reviewCount`, `rating.source`
- `location.address/city/country/coordinates`
- `selection` (current selection metadata)
- `availability.bookingUrl` (deep link to the provider)
- `images[]` with `url`, `alt`, and primary flag
- `agentMetadata` (type-specific attributes, e.g. flight leg details)

When recommendations are not ready, the controller returns HTTP 400 with:

```json
{
  "success": false,
  "error": "Recommendations not ready",
  "message": "Flight recommendations are still being generated",
  "agentStatus": { "status": "running" }
}
```

## Flights

| Action | Method & Path |
| --- | --- |
| List | `GET /api/trip/:tripId/recommendations/flights` |
| Get one | `GET /api/trip/:tripId/recommendations/flights/:recommendationId` |
| Select | `PUT /api/trip/:tripId/recommendations/flights/select` |
| Rerun agent | `POST /api/trip/:tripId/recommendations/flights/rerun` |

### Flight Filters

Query parameters: `minRating`, `maxPrice`, `maxStops`, `airline`, `cabinClass`,
`maxDuration`, `nonStopOnly`, `sortBy` (`rating`, `price_asc`, `price_desc`, `duration_asc`, `duration_desc`, `popularity`).

### Selection Payload

```json
{
  "recommendationId": "6623c9f9f6e2c31d4af3d105",
  "selectedBy": "user123",
  "rank": 1
}
```

## Accommodation

| Action | Method & Path |
| --- | --- |
| List | `GET /api/trip/:tripId/recommendations/hotels` |
| Get one | `GET /api/trip/:tripId/recommendations/hotels/:recommendationId` |
| Select | `PUT /api/trip/:tripId/recommendations/hotels/select` |
| Rerun agent | `POST /api/trip/:tripId/recommendations/hotels/rerun` |

### Hotel Filters

Query parameters: `minRating`, `maxPrice`, `sortBy`, `amenities`, `roomType`,
`nearbyLandmark`, `maxDistance`, `minReviewCount`.

Accommodation results include `images`, `agentMetadata.hotelType`,
`agentMetadata.checkIn/checkOut`, and `availability.bookingUrl`.

## Activities (Experiences)

| Action | Method & Path |
| --- | --- |
| List | `GET /api/trip/:tripId/recommendations/experiences` |
| Get one | `GET /api/trip/:tripId/recommendations/experiences/:recommendationId` |
| Select | `PUT /api/trip/:tripId/recommendations/experiences/select` |
| Rerun agent | `POST /api/trip/:tripId/recommendations/experiences/rerun` |

### Activity Filters

`category`, `minRating`, `maxPrice`, `maxDuration`, `minDuration`, `indoor`,
`skillLevel`, `ageAppropriate`, `sortBy`. Activity metadata exposes duration,
indoor/outdoor flags, accessibility details, and group size.

## Restaurants

| Action | Method & Path |
| --- | --- |
| List | `GET /api/trip/:tripId/recommendations/restaurants` |
| Get one | `GET /api/trip/:tripId/recommendations/restaurants/:recommendationId` |
| Select | `PUT /api/trip/:tripId/recommendations/restaurants/select` |
| Rerun agent | `POST /api/trip/:tripId/recommendations/restaurants/rerun` |

### Restaurant Filters

`minRating`, `maxPrice`, `cuisine`, `dietaryRestriction`, `openNow`, `priceLevel`,
`sortBy`. Restaurant metadata includes photo URLs, Google Place IDs, and booking
links when available.

## /api/recommendations Namespace

The `/api/recommendations` routes mirror the above functionality without the
`/trip/...` prefix:

- `GET /api/recommendations/:tripId/flights`
- `GET /api/recommendations/:tripId/flights/:recommendationId`
- etc.

Use whichever namespace is more convenient; behaviour and payloads are identical.
