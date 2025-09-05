/**
 * Google Places Service
 * 
 * Handles Google Places API calls for restaurant search and place details.
 * Requires GOOGLE_MAPS_API_KEY environment variable.
 * 
 * Features:
 * - searchRestaurants(destination, criteria): Main method to find restaurants by location and criteria
 * - getPlaceDetails(placeId): Get detailed information about a specific place
 * - Comprehensive error handling for all Google API error types
 * - Standardized restaurant object format
 * - Support for cuisine filtering, price range, radius, and open hours
 * 
 * API Endpoints used:
 * - Geocoding: https://maps.googleapis.com/maps/api/geocode/json
 * - Places Nearby: https://maps.googleapis.com/maps/api/place/nearbysearch/json  
 * - Place Details: https://maps.googleapis.com/maps/api/place/details/json
 * 
 * Error handling includes:
 * - Invalid API keys (REQUEST_DENIED)
 * - Rate limit exceeded (OVER_QUERY_LIMIT) 
 * - Invalid locations (ZERO_RESULTS)
 * - Network errors and timeouts
 * - HTTP 403 (billing/permissions) and 429 (rate limits)
 */

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

class GooglePlacesService {
  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.geocodingUrl = 'https://maps.googleapis.com/maps/api/geocode/json';
    this.placesNearbyUrl = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
    this.placeDetailsUrl = 'https://maps.googleapis.com/maps/api/place/details/json';
    this.directionsUrl = 'https://maps.googleapis.com/maps/api/directions/json';
    
    if (!this.apiKey) {
      console.warn('Google Maps API key not found. Set GOOGLE_MAPS_API_KEY environment variable.');
    }
  }

  /**
   * Main method to search restaurants by destination and criteria
   */
  async searchRestaurants(destination, criteria = {}) {
    try {
      // Step 1: Geocode destination to get coordinates
      const location = await this.geocodeDestination(destination);

      // Step 2: Build search parameters from criteria
      const searchOptions = this.buildSearchOptions(criteria);

      // Step 3: Search for nearby restaurants
      const { restaurants } = await this.searchNearbyRestaurants(location, searchOptions);

      // Step 4: Convert to standardized format
      const standardizedRestaurants = restaurants.map(place => this.convertToStandardFormat(place));

      return {
        restaurants: standardizedRestaurants,
        location: location,
        totalFound: standardizedRestaurants.length
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Build search options from criteria
   */
  buildSearchOptions(criteria) {
    const options = {
      radius: (criteria.radius || 5) * 1000, // Convert km to meters, default 5km
      type: 'restaurant'
    };

    // Add cuisine keywords if provided
    if (criteria.cuisines && Array.isArray(criteria.cuisines) && criteria.cuisines.length > 0) {
      options.keyword = criteria.cuisines.join(' ');
    }

    // Add price level filtering
    if (criteria.priceRange) {
      const priceMapping = {
        '$': { minprice: 0, maxprice: 1 },
        '$$': { minprice: 1, maxprice: 2 },
        '$$$': { minprice: 2, maxprice: 3 },
        '$$$$': { minprice: 3, maxprice: 4 }
      };
      
      if (priceMapping[criteria.priceRange]) {
        options.minprice = priceMapping[criteria.priceRange].minprice;
        options.maxprice = priceMapping[criteria.priceRange].maxprice;
      }
    }

    // Add open now filter
    if (criteria.openNow) {
      options.opennow = true;
    }

    return options;
  }

  /**
   * Convert destination string to lat/lng coordinates using Google Geocoding API
   */
  async geocodeDestination(destination) {
    try {
      if (!this.apiKey) {
        throw new Error('Google Maps API key is required');
      }

      const response = await axios.get(this.geocodingUrl, {
        params: {
          address: destination,
          key: this.apiKey
        },
        timeout: 10000
      });

      // Handle different API error statuses
      switch (response.data.status) {
        case 'OK':
          break;
        case 'ZERO_RESULTS':
          throw new Error(`No location found for: ${destination}`);
        case 'OVER_QUERY_LIMIT':
          throw new Error('Google Geocoding API quota exceeded');
        case 'REQUEST_DENIED':
          throw new Error('Invalid Google Maps API key or request denied');
        case 'INVALID_REQUEST':
          throw new Error('Invalid geocoding request parameters');
        default:
          throw new Error(`Geocoding failed: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
      }

      if (!response.data.results || response.data.results.length === 0) {
        throw new Error(`No results found for destination: ${destination}`);
      }

      const location = response.data.results[0].geometry.location;
      const formattedAddress = response.data.results[0].formatted_address;

      return {
        lat: location.lat,
        lng: location.lng,
        formattedAddress
      };
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Google Geocoding API request timeout');
      }
      if (error.response?.status === 403) {
        throw new Error('Google Maps API access forbidden - check billing and API key permissions');
      }
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded - too many requests to Google Maps API');
      }
      throw error;
    }
  }

  /**
   * Search for nearby restaurants using Google Places API
   */
  async searchNearbyRestaurants(location, options = {}) {
    try {
      const {
        radius = 5000, // Default 5km radius
        keyword = '',
        minprice = 0,
        maxprice = 4,
        opennow = false
      } = options;

      const params = {
        location: `${location.lat},${location.lng}`,
        radius: Math.min(radius, 50000), // Google Places API max radius
        type: 'restaurant',
        key: this.apiKey
      };

      // Add optional parameters
      if (keyword) params.keyword = keyword;
      if (minprice !== undefined) params.minprice = minprice;
      if (maxprice !== undefined) params.maxprice = maxprice;
      if (opennow) params.opennow = true;

      const response = await axios.get(this.placesNearbyUrl, {
        params,
        timeout: 15000
      });

      // Handle different API error statuses  
      switch (response.data.status) {
        case 'OK':
          break;
        case 'ZERO_RESULTS':
          return { restaurants: [], nextPageToken: null };
        case 'OVER_QUERY_LIMIT':
          throw new Error('Google Places API quota exceeded');
        case 'REQUEST_DENIED':
          throw new Error('Invalid Google Maps API key or request denied');
        case 'INVALID_REQUEST':
          throw new Error('Invalid Places API request parameters');
        default:
          throw new Error(`Places API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
      }

      const restaurants = response.data.results || [];
      const nextPageToken = response.data.next_page_token || null;

      return { restaurants, nextPageToken };
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Google Places API request timeout');
      }
      if (error.response?.status === 403) {
        throw new Error('Google Maps API access forbidden - check billing and API key permissions');
      }
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded - too many requests to Google Maps API');
      }
      throw error;
    }
  }

  /**
   * Get detailed place information by place_id
   */
  async getPlaceDetails(placeId) {
    try {
      if (!this.apiKey) {
        throw new Error('Google Maps API key is required');
      }

      if (!placeId) {
        throw new Error('Place ID is required');
      }

      const response = await axios.get(this.placeDetailsUrl, {
        params: {
          place_id: placeId,
          fields: 'name,rating,price_level,types,vicinity,formatted_address,opening_hours,photos,international_phone_number,website,reviews,geometry',
          key: this.apiKey
        },
        timeout: 10000
      });

      // Handle different API error statuses
      switch (response.data.status) {
        case 'OK':
          break;
        case 'NOT_FOUND':
          throw new Error(`Place not found: ${placeId}`);
        case 'OVER_QUERY_LIMIT':
          throw new Error('Google Place Details API quota exceeded');
        case 'REQUEST_DENIED':
          throw new Error('Invalid Google Maps API key or request denied');
        case 'INVALID_REQUEST':
          throw new Error('Invalid Place Details API request parameters');
        default:
          throw new Error(`Place Details API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
      }

      return response.data.result;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Google Place Details API request timeout');
      }
      if (error.response?.status === 403) {
        throw new Error('Google Maps API access forbidden - check billing and API key permissions');
      }
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded - too many requests to Google Maps API');
      }
      throw error;
    }
  }

  /**
   * Convert Google's price_level (0-4) to our price range format
   */
  convertPriceLevel(priceLevel) {
    const priceMap = {
      0: '$',     // Free
      1: '$',     // Inexpensive
      2: '$$',    // Moderate
      3: '$$$',   // Expensive
      4: '$$$$'   // Very expensive
    };
    return priceMap[priceLevel] || '$$'; // Default to moderate if unknown
  }

  /**
   * Extract cuisine types from Google Places types array
   */
  extractCuisineFromTypes(types = []) {
    const cuisineMap = {
      'chinese_restaurant': 'Chinese',
      'french_restaurant': 'French',
      'italian_restaurant': 'Italian',
      'japanese_restaurant': 'Japanese',
      'mexican_restaurant': 'Mexican',
      'indian_restaurant': 'Indian',
      'thai_restaurant': 'Thai',
      'mediterranean_restaurant': 'Mediterranean',
      'american_restaurant': 'American',
      'korean_restaurant': 'Korean',
      'vietnamese_restaurant': 'Vietnamese',
      'greek_restaurant': 'Greek',
      'turkish_restaurant': 'Turkish',
      'spanish_restaurant': 'Spanish',
      'german_restaurant': 'German',
      'seafood_restaurant': 'Seafood',
      'steakhouse': 'Steakhouse',
      'sushi_restaurant': 'Japanese',
      'pizza_restaurant': 'Italian',
      'bakery': 'Bakery',
      'cafe': 'Cafe',
      'bar': 'Bar'
    };

    for (const type of types) {
      if (cuisineMap[type]) {
        return cuisineMap[type];
      }
    }

    // If no specific cuisine found, try to infer from restaurant type
    if (types.includes('restaurant')) {
      return 'International';
    }

    return 'Restaurant';
  }

  /**
   * Convert Google Places restaurant data to standardized format
   */
  convertToStandardFormat(googlePlace) {
    return {
      id: googlePlace.place_id,
      name: googlePlace.name || 'Unknown Restaurant',
      cuisine: this.extractCuisineFromTypes(googlePlace.types),
      priceRange: this.convertPriceLevel(googlePlace.price_level),
      rating: googlePlace.rating || 0,
      location: {
        address: googlePlace.vicinity || googlePlace.formatted_address || 'Address not available',
        coordinates: {
          lat: googlePlace.geometry?.location?.lat,
          lng: googlePlace.geometry?.location?.lng
        }
      },
      hours: this.formatOpeningHours(googlePlace.opening_hours),
      features: this.extractFeatures(googlePlace),
      photos: this.extractPhotoReferences(googlePlace.photos),
      averageMeal: this.estimateAverageMeal(googlePlace.price_level),
      reservations: this.hasReservations(googlePlace.types),
      placeId: googlePlace.place_id,
      isOpen: googlePlace.opening_hours?.open_now || false
    };
  }

  /**
   * Convert Google Places restaurant data to our schema format (legacy method for compatibility)
   */
  convertToSchema(googlePlace) {
    return {
      id: googlePlace.place_id,
      name: googlePlace.name,
      cuisine: this.extractCuisineFromTypes(googlePlace.types),
      priceRange: this.convertPriceLevel(googlePlace.price_level),
      rating: googlePlace.rating || 0,
      location: {
        address: googlePlace.vicinity || googlePlace.formatted_address || '',
        coordinates: {
          lat: googlePlace.geometry?.location?.lat,
          lng: googlePlace.geometry?.location?.lng
        }
      },
      hours: this.formatOpeningHours(googlePlace.opening_hours),
      features: this.extractFeatures(googlePlace),
      photos: this.extractPhotoReferences(googlePlace.photos),
      averageMeal: this.estimateAverageMeal(googlePlace.price_level),
      reservations: this.hasReservations(googlePlace.types)
    };
  }

  /**
   * Format Google's opening hours to our format
   */
  formatOpeningHours(openingHours) {
    if (!openingHours) {
      return { status: 'unknown' };
    }

    return {
      isOpen: openingHours.open_now || false,
      periods: openingHours.periods || [],
      weekdayText: openingHours.weekday_text || []
    };
  }

  /**
   * Extract features from Google Places data
   */
  extractFeatures(place) {
    const features = [];
    const types = place.types || [];

    // Map Google types to our features
    if (types.includes('bar')) features.push('bar');
    if (types.includes('night_club')) features.push('nightlife');
    if (types.includes('cafe')) features.push('cafe');
    if (types.includes('bakery')) features.push('bakery');
    if (place.rating >= 4.5) features.push('highly_rated');
    if (place.price_level <= 1) features.push('budget_friendly');
    if (place.price_level >= 3) features.push('upscale');

    return features;
  }

  /**
   * Extract photo references for later use
   */
  extractPhotoReferences(photos) {
    if (!photos || !Array.isArray(photos)) return [];
    
    return photos.slice(0, 5).map(photo => ({
      reference: photo.photo_reference,
      width: photo.width,
      height: photo.height,
      url: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${Math.min(photo.width, 400)}&photoreference=${photo.photo_reference}&key=${this.apiKey}`
    }));
  }

  /**
   * Estimate average meal cost based on price level
   */
  estimateAverageMeal(priceLevel) {
    const priceEstimates = {
      0: 10,   // Free/Very cheap
      1: 20,   // Inexpensive
      2: 40,   // Moderate
      3: 70,   // Expensive
      4: 120   // Very expensive
    };
    return priceEstimates[priceLevel] || 40;
  }

  /**
   * Determine if restaurant likely takes reservations based on type
   */
  hasReservations(types = []) {
    const reservationTypes = [
      'fine_dining_restaurant',
      'upscale_restaurant',
      'steakhouse'
    ];
    
    const casualTypes = [
      'fast_food_restaurant',
      'meal_takeaway',
      'cafe',
      'bakery'
    ];

    if (types.some(type => reservationTypes.includes(type))) {
      return true;
    }
    
    if (types.some(type => casualTypes.includes(type))) {
      return false;
    }

    // Default assumption for restaurants
    return types.includes('restaurant');
  }

  /**
   * Get directions between two locations using Google Directions API
   */
  async getDirections(origin, destination, options = {}) {
    try {
      if (!this.apiKey) {
        throw new Error('Google Maps API key is required');
      }

      if (!origin || !destination) {
        throw new Error('Origin and destination are required');
      }

      const {
        mode = 'driving', // driving, walking, bicycling, transit
        alternatives = true,
        departure_time,
        arrival_time,
        avoid = [],
        units = 'metric'
      } = options;

      const params = {
        origin: origin,
        destination: destination,
        mode: mode,
        alternatives: alternatives,
        key: this.apiKey,
        units: units
      };

      // Add optional parameters
      if (departure_time) params.departure_time = departure_time;
      if (arrival_time) params.arrival_time = arrival_time;
      if (avoid.length > 0) params.avoid = avoid.join('|');

      // Add transit-specific parameters
      if (mode === 'transit') {
        if (departure_time) {
          params.departure_time = departure_time;
        } else {
          params.departure_time = Math.floor(Date.now() / 1000); // Current time
        }
      }

      const response = await axios.get(this.directionsUrl, {
        params,
        timeout: 15000
      });

      // Handle different API error statuses
      switch (response.data.status) {
        case 'OK':
          break;
        case 'NOT_FOUND':
          throw new Error('One or more locations could not be found');
        case 'ZERO_RESULTS':
          throw new Error('No routes could be found between the origin and destination');
        case 'OVER_QUERY_LIMIT':
          throw new Error('Google Directions API quota exceeded');
        case 'REQUEST_DENIED':
          throw new Error('Invalid Google Maps API key or request denied');
        case 'INVALID_REQUEST':
          throw new Error('Invalid Directions API request parameters');
        default:
          throw new Error(`Directions API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
      }

      return response.data;
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Google Directions API request timeout');
      }
      if (error.response?.status === 403) {
        throw new Error('Google Maps API access forbidden - check billing and API key permissions');
      }
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded - too many requests to Google Maps API');
      }
      throw error;
    }
  }

  /**
   * Get transportation routes for multiple travel modes
   */
  async getTransportationRoutes(origin, destination, travelModes = ['driving', 'transit', 'walking'], options = {}) {
    try {
      const routes = [];
      
      // Get routes for each travel mode
      for (const mode of travelModes) {
        try {
          const directions = await this.getDirections(origin, destination, {
            mode,
            ...options
          });
          
          if (directions.routes && directions.routes.length > 0) {
            // Convert each route to our standardized format
            const convertedRoutes = directions.routes.map((route, index) => 
              this.convertDirectionsToTransportFormat(route, mode, index, directions.geocoded_waypoints)
            );
            routes.push(...convertedRoutes);
          }
        } catch (modeError) {
          console.warn(`Failed to get ${mode} directions: ${modeError.message}`);
          // Continue with other modes if one fails
        }
      }

      return routes;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Convert Google Directions route to transportation format
   */
  convertDirectionsToTransportFormat(route, mode, routeIndex, geocodedWaypoints) {
    const leg = route.legs[0]; // Assuming single leg journey
    
    return {
      id: `${mode.toUpperCase()}_${routeIndex + 1}`,
      type: this.mapModeToType(mode),
      provider: this.getProviderForMode(mode),
      service: this.getServiceForMode(mode, route),
      estimatedCost: this.estimateCostForRoute(route, mode),
      estimatedTime: this.formatDuration(leg.duration),
      distance: this.formatDistance(leg.distance),
      mode: mode,
      instructions: this.extractInstructions(leg.steps),
      polyline: route.overview_polyline?.points,
      fare: route.fare ? {
        currency: route.fare.currency,
        text: route.fare.text,
        value: route.fare.value
      } : null,
      transitDetails: mode === 'transit' ? this.extractTransitDetails(leg.steps) : null,
      summary: route.summary,
      warnings: route.warnings || [],
      copyrights: route.copyrights,
      startAddress: leg.start_address,
      endAddress: leg.end_address,
      startLocation: leg.start_location,
      endLocation: leg.end_location,
      route: {
        distance: this.formatDistance(leg.distance),
        duration: this.formatDuration(leg.duration)
      },
      availability: 'immediate',
      capacity: this.getCapacityForMode(mode),
      features: this.getFeaturesForMode(mode)
    };
  }

  /**
   * Map Google travel modes to our transport types
   */
  mapModeToType(mode) {
    const modeMap = {
      'driving': 'driving',
      'walking': 'walking',
      'bicycling': 'bicycling',
      'transit': 'public'
    };
    return modeMap[mode] || 'unknown';
  }

  /**
   * Get provider name for travel mode
   */
  getProviderForMode(mode) {
    const providerMap = {
      'driving': 'Google Maps',
      'walking': 'Google Maps',
      'bicycling': 'Google Maps',
      'transit': 'Public Transit'
    };
    return providerMap[mode] || 'Google Maps';
  }

  /**
   * Get service name for travel mode
   */
  getServiceForMode(mode, route) {
    const leg = route.legs[0];
    
    switch (mode) {
      case 'driving':
        return 'Driving Route';
      case 'walking':
        return 'Walking Route';
      case 'bicycling':
        return 'Cycling Route';
      case 'transit':
        // Try to extract transit info from steps
        const transitSteps = leg.steps.filter(step => step.travel_mode === 'TRANSIT');
        if (transitSteps.length > 0) {
          const transitLines = transitSteps.map(step => 
            step.transit_details?.line?.short_name || step.transit_details?.line?.name
          ).filter(Boolean);
          return transitLines.length > 0 ? transitLines.join(' + ') : 'Public Transit';
        }
        return 'Public Transit';
      default:
        return 'Route';
    }
  }

  /**
   * Get typical capacity for travel mode
   */
  getCapacityForMode(mode) {
    const capacityMap = {
      'driving': 4,
      'walking': 1,
      'bicycling': 1,
      'transit': 50
    };
    return capacityMap[mode] || 1;
  }

  /**
   * Get features for travel mode
   */
  getFeaturesForMode(mode) {
    const featuresMap = {
      'driving': ['flexible_timing', 'door_to_door', 'weather_protected'],
      'walking': ['eco_friendly', 'exercise', 'no_cost'],
      'bicycling': ['eco_friendly', 'exercise', 'no_cost', 'bike_lanes'],
      'transit': ['eco_friendly', 'no_parking_needed', 'fixed_schedule']
    };
    return featuresMap[mode] || [];
  }

  /**
   * Estimate cost for a route based on mode and distance
   */
  estimateCostForRoute(route, mode) {
    const leg = route.legs[0];
    const distanceKm = leg.distance.value / 1000; // Convert meters to km

    switch (mode) {
      case 'driving':
        // Estimate: gas + tolls + parking
        const gasPrice = 1.5; // per liter
        const fuelEfficiency = 8; // km per liter
        const gasCost = (distanceKm / fuelEfficiency) * gasPrice;
        const tollsEstimate = distanceKm * 0.05; // rough estimate
        const parkingCost = 10; // average parking cost
        return Math.round((gasCost + tollsEstimate + parkingCost) * 100) / 100;

      case 'transit':
        // Use fare if available, otherwise estimate
        if (route.fare) {
          return route.fare.value;
        }
        // Rough estimate based on distance
        return Math.max(2.5, Math.min(15, distanceKm * 0.8));

      case 'walking':
      case 'bicycling':
        return 0; // Free

      default:
        return 0;
    }
  }

  /**
   * Format duration object to minutes
   */
  formatDuration(duration) {
    if (!duration) return 'Unknown';
    
    const totalMinutes = Math.round(duration.value / 60);
    
    if (totalMinutes < 60) {
      return `${totalMinutes} minutes`;
    } else {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours} hour${hours > 1 ? 's' : ''}`;
    }
  }

  /**
   * Format distance object to readable string
   */
  formatDistance(distance) {
    if (!distance) return 'Unknown';
    
    const distanceKm = distance.value / 1000;
    
    if (distanceKm < 1) {
      return `${distance.value} m`;
    } else {
      return `${Math.round(distanceKm * 100) / 100} km`;
    }
  }

  /**
   * Extract step-by-step instructions
   */
  extractInstructions(steps) {
    return steps.map((step, index) => ({
      stepNumber: index + 1,
      instruction: step.html_instructions?.replace(/<[^>]*>/g, '') || 'Continue',
      distance: this.formatDistance(step.distance),
      duration: this.formatDuration(step.duration),
      travelMode: step.travel_mode,
      maneuver: step.maneuver,
      transitDetails: step.transit_details ? {
        line: step.transit_details.line?.name,
        vehicle: step.transit_details.line?.vehicle?.name,
        departureStop: step.transit_details.departure_stop?.name,
        arrivalStop: step.transit_details.arrival_stop?.name,
        departureTime: step.transit_details.departure_time?.text,
        arrivalTime: step.transit_details.arrival_time?.text,
        headway: step.transit_details.headway,
        numStops: step.transit_details.num_stops
      } : null
    }));
  }

  /**
   * Extract transit-specific details from route steps
   */
  extractTransitDetails(steps) {
    const transitSteps = steps.filter(step => step.transit_details);
    
    return {
      totalTransitSteps: transitSteps.length,
      lines: transitSteps.map(step => ({
        name: step.transit_details.line?.name,
        shortName: step.transit_details.line?.short_name,
        color: step.transit_details.line?.color,
        vehicle: step.transit_details.line?.vehicle?.name,
        type: step.transit_details.line?.vehicle?.type,
        departureStop: step.transit_details.departure_stop?.name,
        arrivalStop: step.transit_details.arrival_stop?.name,
        departureTime: step.transit_details.departure_time?.text,
        arrivalTime: step.transit_details.arrival_time?.text,
        numStops: step.transit_details.num_stops
      })),
      agencies: [...new Set(transitSteps.map(step => 
        step.transit_details.line?.agencies?.[0]?.name
      ).filter(Boolean))]
    };
  }
}

// Create singleton instance
const googlePlacesService = new GooglePlacesService();
export default googlePlacesService;