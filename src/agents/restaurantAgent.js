import { TripPlanningAgent } from './baseAgent.js';

export class RestaurantAgent extends TripPlanningAgent {
  constructor(aiConfig = {}) {
    super(
      'RestaurantAgent',
      ['restaurant_search', 'cuisine_matching', 'reservation_optimization'],
      aiConfig,
      {
        maxResults: 12,
        providers: ['yelp', 'opentable', 'tripadvisor']
      }
    );
  }

  async search(criteria) {
    // Mock restaurant search - replace with actual API calls
    const mockRestaurants = [
      {
        id: 'REST001',
        name: 'The Local Bistro',
        cuisine: 'French',
        priceRange: '$$',
        rating: 4.5,
        location: { address: '321 Food St', distance: '0.4 miles' },
        features: ['outdoor_seating', 'wine_bar', 'romantic'],
        reservations: true,
        averageMeal: 45,
        hours: { open: '17:00', close: '22:00' }
      },
      {
        id: 'REST002',
        name: 'Sakura Sushi',
        cuisine: 'Japanese',
        priceRange: '$$$',
        rating: 4.7,
        location: { address: '654 Sushi Ave', distance: '0.8 miles' },
        features: ['sushi_bar', 'fresh_fish', 'traditional'],
        reservations: true,
        averageMeal: 65,
        hours: { open: '18:00', close: '23:00' }
      },
      {
        id: 'REST003',
        name: 'Street Food Corner',
        cuisine: 'Mexican',
        priceRange: '$',
        rating: 4.2,
        location: { address: '987 Taco Blvd', distance: '0.6 miles' },
        features: ['casual', 'quick_service', 'authentic'],
        reservations: false,
        averageMeal: 15,
        hours: { open: '11:00', close: '21:00' }
      },
      {
        id: 'REST004',
        name: 'Garden Terrace',
        cuisine: 'Mediterranean',
        priceRange: '$$',
        rating: 4.4,
        location: { address: '147 Garden Way', distance: '1.2 miles' },
        features: ['outdoor_seating', 'vegetarian_friendly', 'garden_view'],
        reservations: true,
        averageMeal: 35,
        hours: { open: '16:00', close: '22:30' }
      }
    ];

    // Filter based on criteria
    return mockRestaurants.filter(restaurant => {
      if (criteria.cuisines && !criteria.cuisines.includes(restaurant.cuisine)) return false;
      if (criteria.priceRange && restaurant.priceRange !== criteria.priceRange) return false;
      if (criteria.minRating && restaurant.rating < criteria.minRating) return false;
      if (criteria.maxDistance) {
        const distance = parseFloat(restaurant.location.distance.split(' ')[0]);
        if (distance > criteria.maxDistance) return false;
      }
      if (criteria.features) {
        const hasRequiredFeatures = criteria.features.every(
          feature => restaurant.features.includes(feature)
        );
        if (!hasRequiredFeatures) return false;
      }
      return true;
    });
  }

  async rank(results) {
    return results.map(restaurant => ({
      ...restaurant,
      score: this.calculateRestaurantScore(restaurant)
    })).sort((a, b) => b.score - a.score);
  }

  calculateRestaurantScore(restaurant) {
    let score = 100;
    
    // Rating factor
    score += (restaurant.rating * 20);
    
    // Price factor (moderate pricing preferred)
    const priceMultiplier = { '$': 15, '$$': 20, '$$$': 10, '$$$$': 5 };
    score += (priceMultiplier[restaurant.priceRange] || 0);
    
    // Distance factor (closer is better)
    const distance = parseFloat(restaurant.location.distance.split(' ')[0]);
    score -= (distance * 8);
    
    // Features bonus
    score += (restaurant.features.length * 3);
    
    // Reservation availability
    if (restaurant.reservations) score += 10;
    
    // Cuisine diversity bonus
    const popularCuisines = ['Italian', 'French', 'Japanese', 'Mediterranean'];
    if (popularCuisines.includes(restaurant.cuisine)) score += 8;
    
    return Math.max(0, score);
  }
}