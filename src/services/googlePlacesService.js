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
}

// Create singleton instance
const googlePlacesService = new GooglePlacesService();
export default googlePlacesService;