import { TripPlanningAgent } from './baseAgent.js';

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
    // Mock transportation search - replace with actual API calls
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
        features: ['door_to_door', 'app_booking']
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
        features: ['door_to_door', 'app_booking', 'driver_rating']
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
        features: ['eco_friendly', 'fixed_schedule']
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
        features: ['flexibility', 'luggage_space', 'parking_required']
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
        features: ['cash_payment', 'local_driver']
      }
    ];

    // Filter based on criteria
    return mockTransportOptions.filter(option => {
      if (criteria.maxCost && option.estimatedCost > criteria.maxCost) return false;
      if (criteria.transportTypes && !criteria.transportTypes.includes(option.type)) return false;
      if (criteria.minCapacity && option.capacity < criteria.minCapacity) return false;
      if (criteria.maxTime) {
        const timeInMinutes = option.estimatedTime.includes('minutes') 
          ? parseInt(option.estimatedTime.split(' ')[0])
          : 60; // assume 1 hour for 'full day'
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
    const timeInMinutes = option.estimatedTime.includes('minutes') 
      ? parseInt(option.estimatedTime.split(' ')[0])
      : 60;
    score -= (timeInMinutes / 3);
    
    // Availability factor (immediate availability preferred)
    if (option.availability === 'immediate') score += 20;
    else if (option.availability.includes('5')) score += 15;
    else if (option.availability.includes('10')) score += 10;
    
    // Type preferences
    const typeBonus = {
      'rideshare': 15,
      'public': 10,
      'taxi': 8,
      'rental': 5
    };
    score += (typeBonus[option.type] || 0);
    
    // Features bonus
    score += (option.features.length * 2);
    
    // Capacity consideration
    if (option.capacity >= 4) score += 5;
    
    return Math.max(0, score);
  }
}