# Google Places API Setup

The RestaurantAgent now uses Google Places API for real restaurant data instead of mock data.

## Setup Instructions

1. **Get Google Places API Key**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable the following APIs:
     - Places API
     - Geocoding API
   - Create credentials (API Key)
   - Restrict the API key to the enabled services

2. **Set Environment Variable**:
   ```bash
   export GOOGLE_MAPS_API_KEY="your_api_key_here"
   ```
   
   Or add to your `.env` file:
   ```
   GOOGLE_MAPS_API_KEY=your_api_key_here
   ```

3. **Enable Billing**:
   - Google Places API requires billing to be enabled
   - Set up billing in Google Cloud Console
   - Monitor usage to avoid unexpected charges

## Features

### Supported Search Parameters
- **location**: Converted from destination string using Google Geocoding
- **radius**: Configurable search radius (default 5km, max 50km)
- **type**: Fixed to 'restaurant'
- **keyword**: Based on cuisine preferences
- **minprice/maxprice**: Converted from our price range format
- **opennow**: Filter for currently open restaurants

### Response Schema Conversion
Google Places data is converted to our schema:
- **place_id** → **id**
- **name** → **name** 
- **types** → **cuisine** (mapped to recognizable cuisines)
- **price_level (0-4)** → **priceRange ($, $$, $$$, $$$$)**
- **rating** → **rating**
- **vicinity** → **location.address**
- **opening_hours** → **hours**
- **photos** → **photos** (with URLs)

### Error Handling
The agent gracefully handles:
- Missing API key (fallback to mock data)
- API quota exceeded (OVER_QUERY_LIMIT)
- Invalid requests (INVALID_REQUEST)
- Network timeouts
- Invalid locations (geocoding failures)

## Usage Examples

### Direct Service Usage
```javascript
import googlePlacesService from './src/services/googlePlacesService.js';

// Search for restaurants
const criteria = {
  cuisines: ['Italian', 'French'],
  priceRange: '$$',
  radius: 5, // km
  openNow: true
};

const result = await googlePlacesService.searchRestaurants('Paris, France', criteria);
console.log(`Found ${result.totalFound} restaurants`);

// Get detailed place information
const details = await googlePlacesService.getPlaceDetails('place_id_here');
console.log(`Restaurant: ${details.name}, Rating: ${details.rating}`);
```

### Through RestaurantAgent
```javascript
import { RestaurantAgent } from './src/agents/restaurantAgent.js';

const agent = new RestaurantAgent();
const result = await agent.execute({ 
  criteria: {
    destination: 'Tokyo, Japan',
    cuisines: ['Japanese'],
    minRating: 4.0
  }
});
```

## Testing

Run the test to verify integration:
```bash
node test/testRestaurantAgent.js
```

Or use the built-in test method:
```javascript
import { RestaurantAgent } from './src/agents/restaurantAgent.js';

const agent = new RestaurantAgent();
agent.testGooglePlacesIntegration();
```

## Fallback Behavior

If Google Places API is unavailable, the agent falls back to curated mock data:
- The Local Bistro (French, $$)
- Sakura Sushi (Japanese, $$$) 
- Street Food Corner (Mexican, $)
- Garden Terrace (Mediterranean, $$)

All filtering and ranking still work with mock data.