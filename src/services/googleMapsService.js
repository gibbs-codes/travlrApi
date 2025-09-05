import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Google Maps Service for handling Google Maps API calls
 * 
 * This service provides a focused interface for Google Maps Directions API
 * with standardized response formatting and comprehensive error handling.
 * 
 * Features:
 * - Multiple travel modes (driving, walking, transit, bicycling)
 * - Cost estimation for different modes
 * - Transit fare extraction
 * - Route optimization and alternatives
 * - Graceful error handling and fallback behavior
 * 
 * Usage:
 *   import googleMapsService from './src/services/googleMapsService.js';
 *   
 *   const routes = await googleMapsService.getDirections(
 *     'New York, NY', 
 *     'Philadelphia, PA', 
 *     'driving'
 *   );
 */

class GoogleMapsService {
  constructor() {
    this.directionsUrl = 'https://maps.googleapis.com/maps/api/directions/json';
    this.timeout = 10000; // 10 second timeout
    
    // Supported travel modes
    this.supportedModes = ['driving', 'walking', 'transit', 'bicycling'];
    
    // Cost estimation constants
    this.costConstants = {
      gasPrice: 1.5, // per liter
      fuelEfficiency: 8, // km per liter
      parkingCost: 10, // average parking cost
      tollRate: 0.05, // per km estimate
      transitBasefare: 2.5, // minimum transit fare
      transitRatePerKm: 0.8 // additional cost per km
    };
  }

  /**
   * Get directions between two locations
   */
  async getDirections(origin, destination, travelMode = 'driving', options = {}) {
    try {
      // Validate travel mode
      if (!this.supportedModes.includes(travelMode)) {
        throw new Error(`Unsupported travel mode: ${travelMode}. Supported modes: ${this.supportedModes.join(', ')}`);
      }

      // Get API key dynamically to allow for testing
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        throw new Error('Google Maps API key not found. Set GOOGLE_MAPS_API_KEY environment variable.');
      }

      // Build request parameters
      const params = {
        origin: origin,
        destination: destination,
        mode: travelMode,
        key: apiKey,
        alternatives: options.alternatives || true,
        units: options.units || 'metric',
        language: options.language || 'en'
      };

      // Add transit-specific options
      if (travelMode === 'transit') {
        if (options.departureTime) {
          params.departure_time = options.departureTime;
        }
        if (options.transitMode) {
          params.transit_mode = options.transitMode;
        }
        if (options.transitRoutingPreference) {
          params.transit_routing_preference = options.transitRoutingPreference;
        }
      }

      // Add driving-specific options
      if (travelMode === 'driving') {
        if (options.avoidTolls) {
          params.avoid = 'tolls';
        }
        if (options.avoidHighways) {
          params.avoid = params.avoid ? `${params.avoid}|highways` : 'highways';
        }
      }

      console.log(`Making Google Directions API request: ${origin} to ${destination} via ${travelMode}`);

      // Make API request
      const response = await axios.get(this.directionsUrl, {
        params,
        timeout: this.timeout
      });

      // Check API response status
      if (response.data.status !== 'OK') {
        return this.handleApiError(response.data.status, response.data.error_message);
      }

      // Parse and standardize response
      return this.parseDirectionsResponse(response.data, travelMode, { origin, destination });

    } catch (error) {
      return this.handleError(error, { origin, destination, travelMode });
    }
  }

  /**
   * Parse Google Directions API response into standardized format
   */
  parseDirectionsResponse(data, travelMode, requestInfo) {
    const routes = data.routes.map((route, index) => {
      const leg = route.legs[0]; // Assuming single leg journey
      
      return {
        id: `${travelMode.toUpperCase()}_${index + 1}`,
        type: this.mapModeToType(travelMode),
        provider: this.getProviderForMode(travelMode),
        service: this.getServiceForMode(travelMode, route),
        mode: travelMode,
        
        // Distance and Duration
        distance: this.formatDistance(leg.distance),
        duration: this.formatDuration(leg.duration),
        estimatedTime: this.formatDuration(leg.duration),
        
        // Cost Estimation
        estimatedCost: this.estimateCost(route, travelMode),
        fare: route.fare ? this.formatFare(route.fare) : null,
        
        // Route Details
        summary: route.summary || `${travelMode} route`,
        startAddress: leg.start_address,
        endAddress: leg.end_address,
        startLocation: leg.start_location,
        endLocation: leg.end_location,
        
        // Steps and Instructions
        steps: this.extractSteps(leg.steps),
        instructions: this.extractInstructions(leg.steps),
        
        // Transit Details
        transitDetails: travelMode === 'transit' ? this.extractTransitDetails(leg.steps) : null,
        
        // Additional Data
        polyline: route.overview_polyline?.points,
        bounds: route.bounds,
        warnings: route.warnings || [],
        copyrights: route.copyrights,
        
        // Metadata
        availability: this.getAvailabilityForMode(travelMode),
        capacity: this.getCapacityForMode(travelMode),
        features: this.getFeaturesForMode(travelMode),
        
        // Route object for compatibility
        route: {
          distance: this.formatDistance(leg.distance),
          duration: this.formatDuration(leg.duration),
          transitDetails: travelMode === 'transit' ? this.extractTransitDetails(leg.steps) : null
        }
      };
    });

    return {
      routes,
      status: 'OK',
      requestInfo,
      geocodedWaypoints: data.geocoded_waypoints,
      totalResults: routes.length
    };
  }

  /**
   * Extract step-by-step instructions
   */
  extractSteps(steps) {
    return steps.map((step, index) => ({
      stepNumber: index + 1,
      instruction: this.cleanHtmlInstructions(step.html_instructions),
      distance: this.formatDistance(step.distance),
      duration: this.formatDuration(step.duration),
      startLocation: step.start_location,
      endLocation: step.end_location,
      travelMode: step.travel_mode,
      maneuver: step.maneuver,
      polyline: step.polyline?.points,
      transitDetails: step.transit_details ? this.formatTransitStep(step.transit_details) : null
    }));
  }

  /**
   * Extract simplified instructions
   */
  extractInstructions(steps) {
    return steps.map(step => this.cleanHtmlInstructions(step.html_instructions));
  }

  /**
   * Extract transit-specific details
   */
  extractTransitDetails(steps) {
    const transitSteps = steps.filter(step => step.travel_mode === 'TRANSIT');
    
    if (transitSteps.length === 0) {
      return null;
    }

    return {
      totalSteps: transitSteps.length,
      lines: transitSteps.map(step => ({
        name: step.transit_details?.line?.name,
        shortName: step.transit_details?.line?.short_name,
        color: step.transit_details?.line?.color,
        textColor: step.transit_details?.line?.text_color,
        vehicle: step.transit_details?.line?.vehicle?.name,
        agencies: step.transit_details?.line?.agencies,
        departureStop: step.transit_details?.departure_stop?.name,
        arrivalStop: step.transit_details?.arrival_stop?.name,
        departureTime: step.transit_details?.departure_time?.text,
        arrivalTime: step.transit_details?.arrival_time?.text,
        headsign: step.transit_details?.headsign,
        numStops: step.transit_details?.num_stops
      })),
      summary: transitSteps.map(step => 
        step.transit_details?.line?.short_name || step.transit_details?.line?.name
      ).filter(Boolean).join(' → ')
    };
  }

  /**
   * Format transit step details
   */
  formatTransitStep(transitDetails) {
    return {
      line: {
        name: transitDetails.line?.name,
        shortName: transitDetails.line?.short_name,
        color: transitDetails.line?.color,
        vehicle: transitDetails.line?.vehicle?.name
      },
      departureStop: transitDetails.departure_stop?.name,
      arrivalStop: transitDetails.arrival_stop?.name,
      departureTime: transitDetails.departure_time?.text,
      arrivalTime: transitDetails.arrival_time?.text,
      numStops: transitDetails.num_stops,
      headsign: transitDetails.headsign
    };
  }

  /**
   * Estimate cost for different travel modes
   */
  estimateCost(route, mode) {
    const leg = route.legs[0];
    const distanceKm = leg.distance.value / 1000; // Convert meters to km

    switch (mode) {
      case 'driving':
        return this.estimateDrivingCost(distanceKm, route);
      case 'transit':
        return this.estimateTransitCost(route, distanceKm);
      case 'walking':
      case 'bicycling':
        return 0; // Free
      default:
        return 0;
    }
  }

  /**
   * Estimate driving costs (gas + tolls + parking)
   */
  estimateDrivingCost(distanceKm, route) {
    const { gasPrice, fuelEfficiency, parkingCost, tollRate } = this.costConstants;
    
    // Gas cost
    const gasCost = (distanceKm / fuelEfficiency) * gasPrice;
    
    // Toll estimate (rough approximation)
    const tollCost = distanceKm * tollRate;
    
    // Parking cost (for destinations that require parking)
    const totalCost = gasCost + tollCost + parkingCost;
    
    return Math.round(totalCost * 100) / 100;
  }

  /**
   * Estimate transit costs
   */
  estimateTransitCost(route, distanceKm) {
    // Use actual fare if available
    if (route.fare) {
      return route.fare.value;
    }
    
    // Estimate based on distance
    const { transitBasefare, transitRatePerKm } = this.costConstants;
    const estimatedFare = transitBasefare + (distanceKm * transitRatePerKm);
    
    return Math.round(Math.min(15, estimatedFare) * 100) / 100; // Cap at $15
  }

  /**
   * Format fare information
   */
  formatFare(fare) {
    return {
      currency: fare.currency,
      text: fare.text,
      value: fare.value
    };
  }

  /**
   * Map travel modes to standardized types
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
    switch (mode) {
      case 'driving':
        return 'Driving Route';
      case 'walking':
        return 'Walking Route';
      case 'bicycling':
        return 'Cycling Route';
      case 'transit':
        // Extract transit line names if available
        const transitSteps = route.legs[0].steps.filter(step => step.travel_mode === 'TRANSIT');
        if (transitSteps.length > 0) {
          const lines = transitSteps.map(step => 
            step.transit_details?.line?.short_name || step.transit_details?.line?.name
          ).filter(Boolean);
          return lines.length > 0 ? lines.join(' + ') : 'Public Transit';
        }
        return 'Public Transit';
      default:
        return 'Route';
    }
  }

  /**
   * Get availability for travel mode
   */
  getAvailabilityForMode(mode) {
    const availabilityMap = {
      'driving': 'immediate',
      'walking': 'immediate',
      'bicycling': 'immediate',
      'transit': '5-10 minutes'
    };
    return availabilityMap[mode] || 'immediate';
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
   * Format duration object to readable string
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
   * Clean HTML tags from instruction text
   */
  cleanHtmlInstructions(htmlInstructions) {
    if (!htmlInstructions) return 'Continue';
    return htmlInstructions.replace(/<[^>]*>/g, '');
  }

  /**
   * Handle Google API errors
   */
  handleApiError(status, errorMessage) {
    const errorMap = {
      'NOT_FOUND': 'One or more locations could not be found',
      'ZERO_RESULTS': 'No routes found between the specified locations',
      'MAX_WAYPOINTS_EXCEEDED': 'Too many waypoints in the request',
      'INVALID_REQUEST': 'Invalid request parameters',
      'OVER_QUERY_LIMIT': 'API quota exceeded',
      'REQUEST_DENIED': 'Request denied - check API key and permissions',
      'UNKNOWN_ERROR': 'Server error occurred'
    };

    const message = errorMap[status] || `API Error: ${status}`;
    const fullMessage = errorMessage ? `${message} - ${errorMessage}` : message;

    throw new Error(fullMessage);
  }

  /**
   * Handle general errors
   */
  handleError(error, context) {
    console.error('Google Maps Service Error:', error.message);
    console.error('Context:', context);

    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout - Google Maps API did not respond');
    }
    
    if (error.response?.status === 403) {
      throw new Error('Access forbidden - check API key permissions and billing');
    }
    
    if (error.response?.status === 429) {
      throw new Error('Rate limit exceeded - too many requests');
    }

    // Re-throw the original error if it's already handled
    throw error;
  }

  /**
   * Get multiple routes for different travel modes
   */
  async getMultiModeDirections(origin, destination, modes = ['driving', 'transit', 'walking'], options = {}) {
    const results = [];
    
    for (const mode of modes) {
      try {
        console.log(`Getting ${mode} directions from ${origin} to ${destination}`);
        const result = await this.getDirections(origin, destination, mode, options);
        
        if (result.routes && result.routes.length > 0) {
          results.push(...result.routes);
        }
      } catch (error) {
        console.warn(`Failed to get ${mode} directions:`, error.message);
        // Continue with other modes
      }
    }

    return {
      routes: results,
      totalModes: modes.length,
      successfulModes: results.length,
      requestInfo: { origin, destination, modes }
    };
  }

  /**
   * Test the Google Maps API connection
   */
  async testConnection() {
    try {
      const testResult = await this.getDirections(
        'New York, NY',
        'Philadelphia, PA',
        'driving'
      );
      
      return {
        success: true,
        message: 'Google Maps API connection successful',
        sampleRoute: testResult.routes[0]
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error
      };
    }
  }
}

// Create and export singleton instance
const googleMapsService = new GoogleMapsService();
export default googleMapsService;