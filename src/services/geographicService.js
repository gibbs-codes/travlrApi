// Geographic Service for TravlrAPI
// Provides location-aware clustering, travel time estimation, and feasibility validation

import logger from '../utils/logger.js';

const log = logger.child({ scope: 'GeographicService' });

class GeographicService {
  constructor() {
    // Mock city centers for development - replace with real geocoding API later
    this.cityCoordinates = {
      'paris': { lat: 48.8566, lng: 2.3522 },
      'london': { lat: 51.5074, lng: -0.1278 },
      'tokyo': { lat: 35.6762, lng: 139.6503 },
      'new york': { lat: 40.7128, lng: -74.0060 },
      'rome': { lat: 41.9028, lng: 12.4964 },
      'barcelona': { lat: 41.3851, lng: 2.1734 },
      'amsterdam': { lat: 52.3676, lng: 4.9041 },
      'berlin': { lat: 52.5200, lng: 13.4050 },
      'madrid': { lat: 40.4168, lng: -3.7038 },
      'vienna': { lat: 48.2082, lng: 16.3738 }
    };

    // Travel time estimates (minutes per km) for different transport modes
    this.transportSpeeds = {
      walking: 12,      // ~5 km/h
      cycling: 4,       // ~15 km/h
      public: 3,        // ~20 km/h (including wait times)
      taxi: 2.5,        // ~24 km/h (city traffic)
      rideshare: 2.5,   // ~24 km/h (city traffic)
      car: 2,           // ~30 km/h (city driving)
      metro: 1.5        // ~40 km/h (direct routes)
    };

    // Maximum feasible daily travel limits (in minutes)
    this.dailyTravelLimits = {
      relaxed: 120,     // 2 hours total travel
      moderate: 180,    // 3 hours total travel
      active: 240,      // 4 hours total travel
      intensive: 300    // 5 hours total travel
    };

    // Clustering parameters
    this.clusteringConfig = {
      maxClusterRadius: 2.0,    // km - max radius for a cluster
      minClusterSize: 2,        // minimum items to form a cluster
      maxClustersPerDay: 3,     // max geographic zones per day
      walkingRadius: 1.0        // km - comfortable walking distance
    };
  }

  // CORE CLUSTERING FUNCTIONS

  /**
   * Group recommendations by proximity using geographic clustering
   * @param {Array} recommendations - Array of recommendations with coordinates
   * @param {Object} options - Clustering options
   * @returns {Array} Array of clusters with recommendations
   */
  groupRecommendationsByLocation(recommendations, options = {}) {
    const config = { ...this.clusteringConfig, ...options };
    
    if (!recommendations || recommendations.length === 0) {
      return [];
    }

    // Filter recommendations with valid coordinates
    const validRecs = recommendations.filter(rec => 
      this.hasValidCoordinates(rec.coordinates || rec.location?.coordinates)
    );

    if (validRecs.length === 0) {
      log.warn('No recommendations with valid coordinates for clustering');
      return [{
        id: 'cluster_default',
        center: null,
        radius: 0,
        recommendations: recommendations,
        travelInfo: { totalDistance: 0, estimatedTime: 0 }
      }];
    }

    log.debug(`Clustering ${validRecs.length} recommendations with valid coordinates`);

    // Use K-means-like clustering approach
    const clusters = this.performClustering(validRecs, config);
    
    // Add unclustered recommendations to nearest cluster
    const unclusteredRecs = recommendations.filter(rec => 
      !this.hasValidCoordinates(rec.coordinates || rec.location?.coordinates)
    );
    
    if (unclusteredRecs.length > 0 && clusters.length > 0) {
      // Add to largest cluster
      const largestCluster = clusters.reduce((max, cluster) => 
        cluster.recommendations.length > max.recommendations.length ? cluster : max
      );
      largestCluster.recommendations.push(...unclusteredRecs);
    }

    return clusters.map(cluster => ({
      ...cluster,
      travelInfo: this.calculateClusterTravelInfo(cluster)
    }));
  }

  /**
   * Perform geographic clustering using distance-based algorithm
   */
  performClustering(recommendations, config) {
    const clusters = [];
    const processed = new Set();

    for (const rec of recommendations) {
      if (processed.has(rec.id || rec.name)) continue;

      const cluster = {
        id: `cluster_${clusters.length + 1}`,
        recommendations: [rec],
        center: this.getCoordinates(rec),
        radius: 0
      };

      processed.add(rec.id || rec.name);

      // Find nearby recommendations
      for (const otherRec of recommendations) {
        if (processed.has(otherRec.id || otherRec.name)) continue;

        const distance = this.calculateDistance(
          this.getCoordinates(rec),
          this.getCoordinates(otherRec)
        );

        if (distance <= config.maxClusterRadius) {
          cluster.recommendations.push(otherRec);
          processed.add(otherRec.id || otherRec.name);
        }
      }

      // Update cluster center and radius
      if (cluster.recommendations.length > 1) {
        cluster.center = this.calculateClusterCenter(cluster.recommendations);
        cluster.radius = this.calculateClusterRadius(cluster.recommendations, cluster.center);
      }

      clusters.push(cluster);
    }

    return clusters.sort((a, b) => b.recommendations.length - a.recommendations.length);
  }

  /**
   * Calculate travel time between two locations
   * @param {Object} from - Starting coordinates {latitude, longitude}
   * @param {Object} to - Destination coordinates {latitude, longitude}
   * @param {String} mode - Transport mode
   * @returns {Object} Travel time info
   */
  calculateTravelTime(from, to, mode = 'walking') {
    if (!this.hasValidCoordinates(from) || !this.hasValidCoordinates(to)) {
      return {
        distance: 0,
        duration: 0,
        mode,
        feasible: false,
        warning: 'Invalid coordinates provided'
      };
    }

    const distance = this.calculateDistance(from, to);
    const minutesPerKm = this.transportSpeeds[mode] || this.transportSpeeds.walking;
    const duration = Math.round(distance * minutesPerKm);
    
    // Feasibility checks
    const feasible = this.isTravelFeasible(distance, duration, mode);
    const warnings = this.getTravelWarnings(distance, duration, mode);

    return {
      distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
      duration,
      mode,
      feasible,
      warnings,
      estimatedCost: this.estimateTravelCost(distance, mode)
    };
  }

  /**
   * Optimize location order for daily routing
   * @param {Array} locations - Array of locations to visit
   * @param {Object} startLocation - Starting point (hotel)
   * @param {String} transportMode - Primary transport mode
   * @returns {Object} Optimized route information
   */
  optimizeLocationOrder(locations, startLocation = null, transportMode = 'walking') {
    if (!locations || locations.length === 0) {
      return {
        optimizedOrder: [],
        totalDistance: 0,
        totalTime: 0,
        feasible: true,
        route: []
      };
    }

    log.debug(`Optimizing route for ${locations.length} locations using ${transportMode}`);

    // Simple nearest-neighbor optimization (can be enhanced with more sophisticated algorithms)
    const optimizedRoute = this.nearestNeighborRoute(locations, startLocation);
    const routeAnalysis = this.analyzeRoute(optimizedRoute, transportMode);

    return {
      optimizedOrder: optimizedRoute.map(location => location.id || location.name),
      totalDistance: routeAnalysis.totalDistance,
      totalTime: routeAnalysis.totalTime,
      feasible: routeAnalysis.feasible,
      route: optimizedRoute,
      segments: routeAnalysis.segments,
      recommendations: this.getRouteRecommendations(routeAnalysis, transportMode)
    };
  }

  /**
   * Validate if daily location plan is realistic
   * @param {Array} dayPlan - Plan for a single day
   * @param {Object} options - Validation options
   * @returns {Object} Feasibility assessment
   */
  validateLocationFeasibility(dayPlan, options = {}) {
    const config = {
      travelStyle: 'moderate',
      transportMode: 'mixed',
      availableTime: 8, // hours
      ...options
    };

    if (!dayPlan || dayPlan.length === 0) {
      return {
        feasible: true,
        score: 100,
        issues: [],
        recommendations: []
      };
    }

    log.debug(`Validating feasibility of ${dayPlan.length} locations for ${config.travelStyle} travel style`);

    const analysis = {
      totalTravelTime: 0,
      totalDistance: 0,
      activitiesTime: 0,
      issues: [],
      recommendations: [],
      segments: []
    };

    // Calculate total travel time and distances
    for (let i = 0; i < dayPlan.length - 1; i++) {
      const from = dayPlan[i];
      const to = dayPlan[i + 1];
      
      const travelInfo = this.calculateTravelTime(
        this.getCoordinates(from),
        this.getCoordinates(to),
        config.transportMode
      );

      analysis.totalTravelTime += travelInfo.duration;
      analysis.totalDistance += travelInfo.distance;
      analysis.segments.push({
        from: from.name,
        to: to.name,
        ...travelInfo
      });

      if (!travelInfo.feasible) {
        analysis.issues.push(`Long travel between ${from.name} and ${to.name} (${travelInfo.duration}min)`);
      }
    }

    // Estimate activity time
    analysis.activitiesTime = dayPlan.reduce((total, activity) => {
      const duration = activity.estimatedDuration || activity.duration || 120; // Default 2 hours
      return total + duration;
    }, 0);

    // Feasibility assessment
    const totalTimeRequired = analysis.totalTravelTime + analysis.activitiesTime;
    const availableTimeMinutes = config.availableTime * 60;
    const maxTravelLimit = this.dailyTravelLimits[config.travelStyle] || this.dailyTravelLimits.moderate;

    // Check feasibility constraints
    if (analysis.totalTravelTime > maxTravelLimit) {
      analysis.issues.push(`Excessive travel time (${analysis.totalTravelTime}min > ${maxTravelLimit}min limit)`);
    }

    if (totalTimeRequired > availableTimeMinutes) {
      analysis.issues.push(`Day overpacked (${Math.round(totalTimeRequired/60)}h > ${config.availableTime}h available)`);
    }

    if (analysis.totalDistance > 20) { // More than 20km in a day
      analysis.issues.push(`Extensive travel distance (${Math.round(analysis.totalDistance)}km)`);
    }

    // Generate recommendations
    analysis.recommendations = this.generateFeasibilityRecommendations(analysis, config);

    // Calculate feasibility score (0-100)
    let score = 100;
    score -= analysis.issues.length * 15; // -15 points per issue
    score -= Math.max(0, (analysis.totalTravelTime - maxTravelLimit) / 10); // -1 point per 10 excess minutes
    score -= Math.max(0, (totalTimeRequired - availableTimeMinutes) / 30); // -1 point per 30 excess minutes

    return {
      feasible: analysis.issues.length === 0,
      score: Math.max(0, Math.round(score)),
      totalTravelTime: analysis.totalTravelTime,
      totalDistance: Math.round(analysis.totalDistance * 100) / 100,
      activitiesTime: analysis.activitiesTime,
      totalTimeRequired: Math.round(totalTimeRequired / 60 * 100) / 100, // in hours
      availableTime: config.availableTime,
      issues: analysis.issues,
      recommendations: analysis.recommendations,
      segments: analysis.segments
    };
  }

  // INTEGRATION HELPER FUNCTIONS

  /**
   * Create context for activity/restaurant agents based on hotel location
   */
  createLocationContext(hotelLocation, existingLocations = []) {
    if (!hotelLocation || !this.hasValidCoordinates(hotelLocation.coordinates)) {
      return {
        preferredAreas: [],
        avoidAreas: [],
        maxDistanceFromHotel: 10,
        transportRecommendations: ['walking', 'public', 'taxi']
      };
    }

    const allLocations = [hotelLocation, ...existingLocations].filter(loc => 
      this.hasValidCoordinates(loc.coordinates)
    );

    const clusters = this.groupRecommendationsByLocation(allLocations, {
      maxClusterRadius: 3.0 // Larger radius for context areas
    });

    return {
      hotelLocation,
      preferredAreas: clusters.map(cluster => ({
        center: cluster.center,
        radius: cluster.radius || 2.0,
        description: `Area around ${cluster.recommendations[0]?.name || 'hotel'}`
      })),
      maxDistanceFromHotel: 5, // km
      transportRecommendations: this.recommendTransportModes(hotelLocation),
      existingClusters: clusters.map(c => c.id)
    };
  }

  /**
   * Provide travel time estimates for transportation agent
   */
  getTransportationEstimates(locations, modes = ['walking', 'public', 'taxi']) {
    const estimates = {};
    
    modes.forEach(mode => {
      estimates[mode] = {
        totalTime: 0,
        totalDistance: 0,
        segments: [],
        feasible: true,
        estimatedCost: 0
      };

      for (let i = 0; i < locations.length - 1; i++) {
        const travelInfo = this.calculateTravelTime(
          this.getCoordinates(locations[i]),
          this.getCoordinates(locations[i + 1]),
          mode
        );

        estimates[mode].segments.push(travelInfo);
        estimates[mode].totalTime += travelInfo.duration;
        estimates[mode].totalDistance += travelInfo.distance;
        estimates[mode].estimatedCost += travelInfo.estimatedCost;
        
        if (!travelInfo.feasible) {
          estimates[mode].feasible = false;
        }
      }
    });

    return estimates;
  }

  /**
   * Flag unrealistic itineraries with specific issues
   */
  flagUnrealisticItineraries(itinerary, options = {}) {
    const flags = [];
    
    itinerary.forEach((day, dayIndex) => {
      const dayValidation = this.validateLocationFeasibility(day.activities || [], {
        travelStyle: options.travelStyle || 'moderate',
        transportMode: options.transportMode || 'mixed',
        availableTime: options.dailyHours || 8
      });

      if (!dayValidation.feasible) {
        flags.push({
          day: dayIndex + 1,
          type: 'feasibility',
          severity: dayValidation.score < 50 ? 'high' : 'medium',
          issues: dayValidation.issues,
          recommendations: dayValidation.recommendations
        });
      }

      // Check for excessive backtracking
      const backtrackingScore = this.detectBacktracking(day.activities || []);
      if (backtrackingScore > 0.3) {
        flags.push({
          day: dayIndex + 1,
          type: 'routing',
          severity: 'medium',
          issues: ['Inefficient routing with excessive backtracking'],
          recommendations: ['Consider reordering activities by location']
        });
      }
    });

    return {
      hasIssues: flags.length > 0,
      flags,
      overallSeverity: this.calculateOverallSeverity(flags),
      summary: this.generateItinerarySummary(flags)
    };
  }

  // UTILITY FUNCTIONS

  hasValidCoordinates(coords) {
    return coords &&
           typeof coords.lat === 'number' &&
           typeof coords.lng === 'number' &&
           coords.lat >= -90 && coords.lat <= 90 &&
           coords.lng >= -180 && coords.lng <= 180;
  }

  getCoordinates(location) {
    if (location.coordinates) return location.coordinates;
    if (location.location?.coordinates) return location.location.coordinates;
    
    // Mock geocoding for development
    const cityName = (location.city || location.location || '').toLowerCase();
    return this.cityCoordinates[cityName] || this.cityCoordinates['paris']; // Default fallback
  }

  calculateDistance(coord1, coord2) {
    if (!this.hasValidCoordinates(coord1) || !this.hasValidCoordinates(coord2)) {
      return 0;
    }

    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(coord2.lat - coord1.lat);
    const dLon = this.toRadians(coord2.lng - coord1.lng);

    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(this.toRadians(coord1.lat)) * Math.cos(this.toRadians(coord2.lat)) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  calculateClusterCenter(recommendations) {
    const validCoords = recommendations
      .map(rec => this.getCoordinates(rec))
      .filter(coord => this.hasValidCoordinates(coord));

    if (validCoords.length === 0) return null;

    const avgLat = validCoords.reduce((sum, coord) => sum + coord.lat, 0) / validCoords.length;
    const avgLng = validCoords.reduce((sum, coord) => sum + coord.lng, 0) / validCoords.length;

    return { lat: avgLat, lng: avgLng };
  }

  calculateClusterRadius(recommendations, center) {
    if (!center) return 0;

    const distances = recommendations
      .map(rec => this.calculateDistance(center, this.getCoordinates(rec)))
      .filter(dist => dist > 0);

    return distances.length > 0 ? Math.max(...distances) : 0;
  }

  calculateClusterTravelInfo(cluster) {
    const { recommendations } = cluster;
    let totalDistance = 0;
    let totalTime = 0;

    for (let i = 0; i < recommendations.length - 1; i++) {
      const distance = this.calculateDistance(
        this.getCoordinates(recommendations[i]),
        this.getCoordinates(recommendations[i + 1])
      );
      const time = distance * this.transportSpeeds.walking;
      
      totalDistance += distance;
      totalTime += time;
    }

    return {
      totalDistance: Math.round(totalDistance * 100) / 100,
      estimatedTime: Math.round(totalTime),
      walkable: totalDistance <= this.clusteringConfig.walkingRadius
    };
  }

  nearestNeighborRoute(locations, startLocation) {
    const route = [];
    const unvisited = [...locations];
    let current = startLocation;

    // If no start location, use first location
    if (!current && unvisited.length > 0) {
      current = unvisited.shift();
    }

    if (current) route.push(current);

    while (unvisited.length > 0) {
      let nearest = unvisited[0];
      let minDistance = this.calculateDistance(
        this.getCoordinates(current),
        this.getCoordinates(nearest)
      );

      for (let i = 1; i < unvisited.length; i++) {
        const distance = this.calculateDistance(
          this.getCoordinates(current),
          this.getCoordinates(unvisited[i])
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          nearest = unvisited[i];
        }
      }

      route.push(nearest);
      unvisited.splice(unvisited.indexOf(nearest), 1);
      current = nearest;
    }

    return route;
  }

  analyzeRoute(route, transportMode) {
    let totalDistance = 0;
    let totalTime = 0;
    const segments = [];
    let feasible = true;

    for (let i = 0; i < route.length - 1; i++) {
      const travelInfo = this.calculateTravelTime(
        this.getCoordinates(route[i]),
        this.getCoordinates(route[i + 1]),
        transportMode
      );

      segments.push(travelInfo);
      totalDistance += travelInfo.distance;
      totalTime += travelInfo.duration;
      
      if (!travelInfo.feasible) {
        feasible = false;
      }
    }

    return {
      totalDistance: Math.round(totalDistance * 100) / 100,
      totalTime: Math.round(totalTime),
      feasible,
      segments
    };
  }

  isTravelFeasible(distance, duration, mode) {
    // Simple feasibility rules - can be enhanced
    const limits = {
      walking: { maxDistance: 3, maxDuration: 45 },
      cycling: { maxDistance: 15, maxDuration: 60 },
      public: { maxDistance: 50, maxDuration: 90 },
      taxi: { maxDistance: 30, maxDuration: 60 },
      rideshare: { maxDistance: 30, maxDuration: 60 },
      car: { maxDistance: 50, maxDuration: 90 },
      metro: { maxDistance: 25, maxDuration: 45 }
    };

    const limit = limits[mode] || limits.walking;
    return distance <= limit.maxDistance && duration <= limit.maxDuration;
  }

  getTravelWarnings(distance, duration, mode) {
    const warnings = [];
    
    if (mode === 'walking' && distance > 2) {
      warnings.push('Long walking distance - consider alternative transport');
    }
    
    if (duration > 45) {
      warnings.push('Travel time exceeds 45 minutes');
    }
    
    if (distance > 10) {
      warnings.push('Long distance travel may be tiring');
    }

    return warnings;
  }

  estimateTravelCost(distance, mode) {
    // Mock cost estimation - replace with real pricing data
    const costs = {
      walking: 0,
      cycling: 0,
      public: 2.5,       // Base fare
      taxi: 3.5 + (distance * 1.2),  // Base + per km
      rideshare: 3.0 + (distance * 1.1),
      car: distance * 0.3,  // Fuel/parking
      metro: 2.5         // Base fare
    };

    return Math.round((costs[mode] || 0) * 100) / 100;
  }

  recommendTransportModes(location) {
    // Mock recommendations based on location type
    return ['walking', 'public', 'taxi', 'rideshare'];
  }

  getRouteRecommendations(routeAnalysis, transportMode) {
    const recommendations = [];
    
    if (routeAnalysis.totalTime > 180) {
      recommendations.push('Consider splitting into multiple days');
    }
    
    if (routeAnalysis.totalDistance > 10 && transportMode === 'walking') {
      recommendations.push('Consider using public transport or taxi');
    }
    
    if (!routeAnalysis.feasible) {
      recommendations.push('Route may not be feasible - consider alternative locations');
    }

    return recommendations;
  }

  generateFeasibilityRecommendations(analysis, config) {
    const recommendations = [];
    
    if (analysis.totalTravelTime > this.dailyTravelLimits[config.travelStyle]) {
      recommendations.push('Reduce number of locations or choose closer alternatives');
      recommendations.push('Consider staying in area for multiple activities');
    }
    
    if (analysis.totalDistance > 15) {
      recommendations.push('Plan activities by geographic area to reduce travel');
    }

    return recommendations;
  }

  detectBacktracking(locations) {
    if (locations.length < 3) return 0;
    
    let backtrackScore = 0;
    const coordinates = locations.map(loc => this.getCoordinates(loc));
    
    for (let i = 0; i < coordinates.length - 2; i++) {
      const dist1to2 = this.calculateDistance(coordinates[i], coordinates[i + 1]);
      const dist2to3 = this.calculateDistance(coordinates[i + 1], coordinates[i + 2]);
      const direct1to3 = this.calculateDistance(coordinates[i], coordinates[i + 2]);
      
      const detourRatio = (dist1to2 + dist2to3) / direct1to3;
      if (detourRatio > 1.5) {
        backtrackScore += 0.1;
      }
    }
    
    return Math.min(backtrackScore, 1.0);
  }

  calculateOverallSeverity(flags) {
    const highCount = flags.filter(f => f.severity === 'high').length;
    const mediumCount = flags.filter(f => f.severity === 'medium').length;
    
    if (highCount > 0) return 'high';
    if (mediumCount > 2) return 'high';
    if (mediumCount > 0) return 'medium';
    return 'low';
  }

  generateItinerarySummary(flags) {
    if (flags.length === 0) {
      return 'Itinerary appears feasible with no major issues detected';
    }
    
    const issueTypes = [...new Set(flags.map(f => f.type))];
    const affectedDays = [...new Set(flags.map(f => f.day))];
    
    return `${flags.length} issues detected affecting ${affectedDays.length} days. Main concerns: ${issueTypes.join(', ')}`;
  }

  // Mock geocoding function for development
  async mockGeocode(address) {
    log.debug(`Mock geocoding: ${address}`);
    
    // Simple city matching
    const cityName = address.toLowerCase();
    const coordinates = this.cityCoordinates[cityName];
    
    if (coordinates) {
      return {
        success: true,
        coordinates,
        formattedAddress: address,
        city: cityName,
        country: 'Mock Country'
      };
    }
    
    // Return default coordinates for unknown locations
    return {
      success: false,
      coordinates: this.cityCoordinates['paris'],
      formattedAddress: address,
      city: 'Unknown',
      country: 'Unknown',
      warning: 'Using default coordinates - implement real geocoding'
    };
  }
}

// Create singleton instance
const geographicService = new GeographicService();

export default geographicService;
export { GeographicService };
