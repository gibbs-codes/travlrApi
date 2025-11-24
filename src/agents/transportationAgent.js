/**
 * TransportationAgent - LOCAL TRANSPORTATION RECOMMENDATIONS
 *
 * ⚠️ TODO: FUTURE FEATURE - NOT YET INTEGRATED
 *
 * This agent is designed to provide local transportation recommendations
 * (Uber, Lyft, public transit, rental cars, etc.) but is not currently
 * integrated into the trip planning flow.
 *
 * STATUS:
 * - ✅ Agent implementation complete
 * - ✅ Model fields present (Trip.transportation, preferences.transportation)
 * - ✅ Recommendation enum includes 'transportation'
 * - ❌ NOT included in UI agent types (only flight, accommodation, restaurant, activity)
 * - ❌ NOT registered in trip orchestrator
 * - ❌ NOT accessible via API routes
 *
 * TO ENABLE:
 * 1. Add 'transportation' to travlrUI/lib/api/schemas.ts agentTypeSchema
 * 2. Register TransportationAgent in tripOrchestrator.js
 * 3. Add route handler in trip.js (POST /trip/:id/agent/transportation)
 * 4. Add UI components for transportation recommendations
 *
 * @see models/Trip.js - transportation preferences and recommendation arrays
 * @see models/Recommendation.js - 'transportation' is valid agentType
 */

import { TripPlanningAgent } from './baseAgent.js';
import googlePlacesService from '../services/googlePlacesService.js';

export class TransportationAgent extends TripPlanningAgent {
  constructor(aiConfig = {}) {
    super(
      'TransportationAgent',
      ['transport_search', 'route_optimization', 'cost_analysis'],
      aiConfig,
      {
        maxResults: 8,
        providers: ['uber', 'lyft', 'public_transport', 'rental_cars']
      }
    );
  }

  async search(criteria) {
    try {
      // Use Google Directions API for real route data
      if (!criteria.origin || !criteria.destination) {
        throw new Error('Origin and destination are required for transportation search');
      }

      // Determine travel modes based on criteria
      let travelModes = ['driving', 'transit', 'walking'];
      if (criteria.transportTypes) {
        travelModes = this.mapTransportTypesToModes(criteria.transportTypes);
      }
      if (criteria.includeBicycling) {
        travelModes.push('bicycling');
      }

      // Get routes from Google Directions API
      const routes = await googlePlacesService.getTransportationRoutes(
        criteria.origin, 
        criteria.destination, 
        travelModes
      );

      // Filter based on criteria
      return routes.filter(route => {
        if (criteria.maxCost && route.estimatedCost > criteria.maxCost) return false;
        if (criteria.transportTypes && !criteria.transportTypes.includes(route.type)) return false;
        if (criteria.minCapacity && route.capacity < criteria.minCapacity) return false;
        if (criteria.maxTime) {
          const timeInMinutes = this.parseTimeToMinutes(route.estimatedTime);
          if (timeInMinutes > criteria.maxTime) return false;
        }
        return true;
      });

    } catch (error) {
      this.logInfo(`Google Directions API unavailable, using fallback data: ${error.message}`);
      return this.getMockTransportOptions(criteria);
    }
  }

  mapTransportTypesToModes(transportTypes) {
    const modeMap = {
      'driving': 'driving',
      'public': 'transit',
      'transit': 'transit',
      'walking': 'walking',
      'bicycle': 'bicycling',
      'bicycling': 'bicycling'
    };

    return transportTypes.map(type => modeMap[type] || 'driving').filter(Boolean);
  }

  parseTimeToMinutes(timeString) {
    if (typeof timeString === 'string') {
      if (timeString.includes('hour')) {
        const hours = parseInt(timeString.match(/(\d+)\s*hour/i)?.[1] || '0');
        const minutes = parseInt(timeString.match(/(\d+)\s*min/i)?.[1] || '0');
        return hours * 60 + minutes;
      } else if (timeString.includes('min')) {
        return parseInt(timeString.match(/(\d+)/)?.[1] || '0');
      } else if (timeString.includes('day')) {
        return 480; // 8 hours for full day
      }
    }
    return parseInt(timeString) || 60;
  }

  getMockTransportOptions(criteria) {
    const mockTransportOptions = [
      {
        id: 'TRANS001',
        type: 'rideshare',
        provider: 'Uber',
        service: 'UberX',
        estimatedCost: 25,
        estimatedTime: '15 minutes',
        availability: 'immediate',
        capacity: 4,
        features: ['door_to_door', 'app_booking'],
        route: {
          distance: '8.2 km',
          duration: '15 mins'
        }
      },
      {
        id: 'TRANS002',
        type: 'rideshare',
        provider: 'Lyft',
        service: 'Lyft Standard',
        estimatedCost: 23,
        estimatedTime: '12 minutes',
        availability: 'immediate',
        capacity: 4,
        features: ['door_to_door', 'app_booking', 'driver_rating'],
        route: {
          distance: '8.2 km',
          duration: '12 mins'
        }
      },
      {
        id: 'TRANS003',
        type: 'public',
        provider: 'Metro',
        service: 'Bus + Subway',
        estimatedCost: 3.50,
        estimatedTime: '35 minutes',
        availability: '5 minutes',
        capacity: 50,
        features: ['eco_friendly', 'fixed_schedule'],
        route: {
          distance: '12.4 km',
          duration: '35 mins',
          transitDetails: {
            steps: ['Walk to Station A', 'Take Line 1 to Station B', 'Transfer to Line 3', 'Walk to destination']
          }
        }
      },
      {
        id: 'TRANS004',
        type: 'rental',
        provider: 'Enterprise',
        service: 'Compact Car',
        estimatedCost: 45,
        estimatedTime: 'full day',
        availability: '30 minutes',
        capacity: 4,
        features: ['flexibility', 'luggage_space', 'parking_required'],
        route: {
          distance: 'Various',
          duration: 'Full day'
        }
      },
      {
        id: 'TRANS005',
        type: 'taxi',
        provider: 'Yellow Cab',
        service: 'Standard Taxi',
        estimatedCost: 28,
        estimatedTime: '18 minutes',
        availability: '10 minutes',
        capacity: 4,
        features: ['cash_payment', 'local_driver'],
        route: {
          distance: '8.2 km',
          duration: '18 mins'
        }
      }
    ];

    // Filter based on criteria
    return mockTransportOptions.filter(option => {
      if (criteria.maxCost && option.estimatedCost > criteria.maxCost) return false;
      if (criteria.transportTypes && !criteria.transportTypes.includes(option.type)) return false;
      if (criteria.minCapacity && option.capacity < criteria.minCapacity) return false;
      if (criteria.maxTime) {
        const timeInMinutes = this.parseTimeToMinutes(option.estimatedTime);
        if (timeInMinutes > criteria.maxTime) return false;
      }
      return true;
    });
  }

  async rank(results) {
    return results.map(option => ({
      ...option,
      score: this.calculateTransportScore(option)
    })).sort((a, b) => b.score - a.score);
  }

  calculateTransportScore(option) {
    let score = 100;

    // Cost factor (lower cost = higher score)
    score -= (option.estimatedCost / 2);

    // Time factor (faster = higher score)
    const timeInMinutes = this.parseTimeToMinutes(option.estimatedTime);
    score -= (timeInMinutes / 3);

    // Availability factor (immediate availability preferred)
    if (option.availability === 'immediate') score += 20;
    else if (option.availability && option.availability.includes('5')) score += 15;
    else if (option.availability && option.availability.includes('10')) score += 10;

    // Type preferences - prioritize efficient modes
    const typeBonus = {
      'driving': 15,
      'transit': 12,
      'rideshare': 15,
      'public': 10,
      'walking': 5,
      'bicycling': 8,
      'taxi': 8,
      'rental': 5
    };
    score += (typeBonus[option.type] || 0);

    // Features bonus
    if (option.features && Array.isArray(option.features)) {
      score += (option.features.length * 2);
    }

    // Capacity consideration
    if (option.capacity >= 4) score += 5;

    // Real-time data bonus (Google Directions vs mock)
    if (option.id && !option.id.startsWith('TRANS')) {
      score += 10; // Bonus for real Google Directions data
    }

    // Route efficiency bonus
    if (option.route && option.route.distance) {
      // Prefer shorter distances for same time
      const distanceValue = parseFloat(option.route.distance.replace(/[^\d.]/g, ''));
      if (distanceValue && distanceValue < 10) score += 5;
    }

    return Math.max(0, score);
  }

  async generateRecommendations(results, task) {
    const startTime = Date.now();
    this.logInfo('🎯 TransportationAgent.generateRecommendations: Starting');
    this.logInfo(`   Input: ${results ? results.length : 0} results`);

    if (!results || results.length === 0) {
      this.logWarn('⚠️ TransportationAgent: No results to transform');
      return {
        content: {
          recommendations: [],
          confidence: 0,
          reasoning: 'No transportation options found.'
        },
        metadata: { searchCriteria: task.criteria }
      };
    }

    this.logInfo('🔍 TransportationAgent: Transforming transportation data...');

    // Transform to TripOrchestrator recommendation format
    const recommendations = results.slice(0, 5).map((option, index) => {
      this.logInfo(`   Processing option ${index + 1}:`, {
        type: option.type,
        provider: option.provider,
        service: option.service,
        cost: option.estimatedCost,
        time: option.estimatedTime
      });

      const recommendation = {
        id: option.id || `transport_${index + 1}`,
        name: option.service || option.provider || 'Transportation Option',
        description: `${option.type} via ${option.provider || 'local service'}: ${option.estimatedTime || 'estimated time'}${option.route?.distance ? `, ${option.route.distance}` : ''}`,
        price: {
          amount: option.estimatedCost || 0,
          currency: task.criteria?.currency || 'USD',
          priceType: 'total'
        },
        rating: {
          score: 0,
          reviewCount: 0,
          source: 'transportation_agent'
        },
        location: {
          city: task.criteria?.destination
        },
        agentMetadata: {
          transportType: option.type,
          provider: option.provider,
          service: option.service,
          estimatedTime: option.estimatedTime,
          availability: option.availability,
          capacity: option.capacity,
          features: option.features || [],
          route: option.route
        }
      };

      this.logInfo(`   Created recommendation:`, {
        name: recommendation.name,
        type: recommendation.agentMetadata.transportType,
        price: recommendation.price.amount
      });

      return recommendation;
    });

    const duration = Date.now() - startTime;
    this.logInfo(`✅ TransportationAgent: Transformed ${recommendations.length} recommendations in ${duration}ms`);

    return {
      content: {
        recommendations,
        confidence: 75,
        reasoning: `Found ${results.length} transportation options. Recommendations based on cost, time, and convenience.`
      },
      metadata: {
        totalFound: results.length,
        searchCriteria: task.criteria,
        source: results[0]?.id?.startsWith('TRANS') ? 'mock' : 'Google Directions'
      }
    };
  }
}