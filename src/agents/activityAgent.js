import { TripPlanningAgent } from './baseAgent.js';

export class ActivityAgent extends TripPlanningAgent {
  constructor(aiConfig = {}) {
    super(
      'ActivityAgent',
      ['activity_search', 'experience_curation', 'schedule_optimization'],
      aiConfig,
      {
        maxResults: 20,
        providers: ['viator', 'getyourguide', 'tripadvisor']
      }
    );
  }

  async search(criteria) {
    // Mock activity search - replace with actual API calls
    const mockActivities = [
      {
        id: 'ACT001',
        name: 'City Walking Tour',
        type: 'tour',
        category: 'cultural',
        duration: '3 hours',
        price: 45,
        rating: 4.6,
        description: 'Explore the historic downtown area with a local guide',
        availability: ['morning', 'afternoon'],
        groupSize: 'small',
        difficulty: 'easy'
      },
      {
        id: 'ACT002',
        name: 'Food Market Experience',
        type: 'culinary',
        category: 'food',
        duration: '2.5 hours',
        price: 65,
        rating: 4.8,
        description: 'Taste local specialties and learn about regional cuisine',
        availability: ['morning'],
        groupSize: 'small',
        difficulty: 'easy'
      },
      {
        id: 'ACT003',
        name: 'Mountain Hiking Adventure',
        type: 'outdoor',
        category: 'adventure',
        duration: '6 hours',
        price: 80,
        rating: 4.4,
        description: 'Challenging hike with scenic views and wildlife spotting',
        availability: ['morning'],
        groupSize: 'medium',
        difficulty: 'moderate'
      },
      {
        id: 'ACT004',
        name: 'Art Museum Pass',
        type: 'cultural',
        category: 'art',
        duration: 'self-paced',
        price: 25,
        rating: 4.3,
        description: 'Access to three major art museums in the city',
        availability: ['all-day'],
        groupSize: 'individual',
        difficulty: 'easy'
      }
    ];

    // Filter based on criteria
    return mockActivities.filter(activity => {
      if (criteria.maxPrice && activity.price > criteria.maxPrice) return false;
      if (criteria.categories && !criteria.categories.includes(activity.category)) return false;
      if (criteria.difficulty && activity.difficulty !== criteria.difficulty) return false;
      if (criteria.duration) {
        const activityHours = activity.duration.includes('hours') 
          ? parseInt(activity.duration.split(' ')[0]) 
          : 8; // assume full day for self-paced
        if (criteria.duration === 'short' && activityHours > 3) return false;
        if (criteria.duration === 'long' && activityHours < 4) return false;
      }
      return true;
    });
  }

  async rank(results) {
    return results.map(activity => ({
      ...activity,
      score: this.calculateActivityScore(activity)
    })).sort((a, b) => b.score - a.score);
  }

  calculateActivityScore(activity) {
    let score = 100;
    
    // Rating factor
    score += (activity.rating * 15);
    
    // Price factor (moderate pricing preferred)
    if (activity.price < 100) score += 10;
    if (activity.price < 50) score += 5;
    
    // Category bonuses
    const popularCategories = ['cultural', 'food', 'adventure'];
    if (popularCategories.includes(activity.category)) score += 10;
    
    // Duration preference (2-4 hours preferred)
    if (activity.duration.includes('hours')) {
      const hours = parseInt(activity.duration.split(' ')[0]);
      if (hours >= 2 && hours <= 4) score += 15;
    }
    
    // Difficulty preference (easy to moderate preferred)
    if (activity.difficulty === 'easy') score += 10;
    if (activity.difficulty === 'moderate') score += 5;
    
    return Math.max(0, score);
  }
}