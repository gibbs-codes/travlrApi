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
    
    // Override the base resultSchema with activity-specific structure
    this.resultSchema = {
      recommendations: [
        {
          id: 'string',
          name: 'string',
          description: 'string',
          category: 'string', // cultural, food, adventure, entertainment, nature, arts, historical, etc.
          duration: 'string',
          price: 'number', // Changed from estimatedPrice to match TripOrchestrator expectations
          rating: 'number',
          location: 'string',
          bookingRequired: 'boolean'
        }
      ],
      confidence: 'number', // 0-100 confidence score
      reasoning: 'string', // Explanation of why these activities were selected
      metadata: {
        source: 'string',
        timestamp: 'string',
        totalResults: 'number',
        destination: 'string',
        searchCriteria: {}
      }
    };

    this.mockActivities = [
      {
        id: 'ACT001',
        name: 'City Walking Tour',
        description: 'Explore the historic downtown area with a local guide',
        category: 'cultural',
        duration: '3 hours',
        price: 45,
        rating: 4.6,
        location: 'Downtown Historic District',
        bookingRequired: true
      },
      {
        id: 'ACT002',
        name: 'Food Market Experience',
        description: 'Taste local specialties and learn about regional cuisine',
        category: 'food',
        duration: '2.5 hours',
        price: 65,
        rating: 4.8,
        location: 'Central Market',
        bookingRequired: true
      },
      {
        id: 'ACT003',
        name: 'Mountain Hiking Adventure',
        description: 'Challenging hike with scenic views and wildlife spotting',
        category: 'adventure',
        duration: '6 hours',
        price: 80,
        rating: 4.4,
        location: 'National Park Trail',
        bookingRequired: false
      },
      {
        id: 'ACT004',
        name: 'Art Museum Pass',
        description: 'Access to three major art museums in the city',
        category: 'art',
        duration: 'self-paced',
        price: 25,
        rating: 4.3,
        location: 'Museum District',
        bookingRequired: false
      }
    ];
  }

  async search(criteria) {
    try {
      const prompt = this.buildActivitySearchPrompt(criteria);
      
      const activitySchema = {
        recommendations: [
          {
            id: 'string',
            name: 'string',
            description: 'string',
            category: 'string',
            duration: 'string',
            price: 'number',
            rating: 'number',
            location: 'string',
            bookingRequired: 'boolean'
          }
        ]
      };

      const response = await this.generateStructuredResponse(prompt, activitySchema);
      
      // More robust response parsing
      let recommendations = null;
      
      if (response) {
        // Try different possible response structures
        if (response.content && response.content.recommendations && Array.isArray(response.content.recommendations)) {
          recommendations = response.content.recommendations;
        } else if (response.recommendations && Array.isArray(response.recommendations)) {
          recommendations = response.recommendations;
        } else if (response.content && response.content.activities && Array.isArray(response.content.activities)) {
          recommendations = response.content.activities;
        } else if (response.activities && Array.isArray(response.activities)) {
          recommendations = response.activities;
        } else if (Array.isArray(response)) {
          recommendations = response;
        }
      }
      
      if (recommendations && Array.isArray(recommendations) && recommendations.length > 0) {
        return recommendations;
      } else {
        throw new Error(`Invalid AI response format. Expected array of recommendations, got: ${typeof response}`);
      }
    } catch (error) {
      console.warn(`ActivityAgent AI search failed: ${error.message}. Falling back to mock data.`);
      return this.getMockActivities(criteria);
    }
  }

  buildActivitySearchPrompt(criteria) {
    const {
      destination,
      interests = [],
      travelersCount = 1,
      durationPreferences = 'flexible',
      budget,
      travelStyle,
      dates
    } = criteria;

    return `You are a travel activity expert. Generate 5-8 specific, high-quality activity recommendations for the following criteria:

DESTINATION: ${destination}
TRAVELERS: ${travelersCount} person${travelersCount > 1 ? 's' : ''}
INTERESTS: ${interests.length > 0 ? interests.join(', ') : 'General sightseeing and cultural experiences'}
DURATION PREFERENCES: ${durationPreferences}
${budget ? `BUDGET: ${budget}` : ''}
${travelStyle ? `TRAVEL STYLE: ${travelStyle}` : ''}
${dates ? `TRAVEL DATES: ${dates}` : ''}

REQUIREMENTS:
1. Each activity must be specific to the destination and realistically available there
2. Vary activity types: cultural, adventure, food, entertainment, nature, arts, historical, etc.
3. Include a mix of durations: some short (1-3 hours), some longer (4-8 hours)
4. Consider the traveler interests and suggest activities that align with them
5. Provide realistic pricing in USD
6. Include accurate location details within the destination
7. Specify if advance booking is typically required

For each activity, provide:
- id: unique identifier (ACT + 3 digits)
- name: specific, appealing activity name
- description: detailed description (2-3 sentences) explaining what travelers will experience
- category: one word category (cultural, adventure, food, nature, entertainment, arts, historical, shopping, etc.)
- duration: specific time estimate (e.g., "2 hours", "half day", "full day")
- price: realistic price per person in USD (number only)
- rating: realistic rating out of 5 (decimal allowed, e.g., 4.3)
- location: specific area/neighborhood within the destination
- bookingRequired: true if advance booking typically needed, false if walk-in friendly

Also provide:
- confidence: your confidence level in these recommendations (0-100)
- reasoning: brief explanation of why these activities fit the criteria
- totalResults: number of activities provided

Focus on quality over quantity. Make recommendations that would genuinely enhance a traveler's experience in ${destination}.`;
  }

  getMockActivities(criteria) {
    const filtered = this.mockActivities.filter(activity => {
      if (criteria.budget && activity.price > criteria.budget) return false;
      if (criteria.interests && criteria.interests.length > 0) {
        const hasMatchingInterest = criteria.interests.some(interest => 
          activity.category.toLowerCase().includes(interest.toLowerCase()) ||
          activity.description.toLowerCase().includes(interest.toLowerCase())
        );
        if (!hasMatchingInterest) return false;
      }
      return true;
    });

    return filtered;
  }

  async rank(results) {
    if (!results || !Array.isArray(results)) {
      return results;
    }

    return results.map(activity => ({
      ...activity,
      score: this.calculateActivityScore(activity)
    })).sort((a, b) => b.score - a.score);
  }

  calculateActivityScore(activity) {
    let score = 100;
    
    // Rating factor
    if (activity.rating) {
      score += (activity.rating * 15);
    }
    
    // Price factor (moderate pricing preferred)
    const price = activity.price || 0;
    if (price < 100) score += 10;
    if (price < 50) score += 5;
    
    // Category bonuses
    const popularCategories = ['cultural', 'food', 'adventure', 'nature', 'arts'];
    if (activity.category && popularCategories.includes(activity.category.toLowerCase())) {
      score += 10;
    }
    
    // Duration preference (2-4 hours preferred)
    if (activity.duration && activity.duration.includes('hour')) {
      const durationStr = activity.duration.toLowerCase();
      const hours = parseInt(durationStr.split(' ')[0]) || 0;
      if (hours >= 2 && hours <= 4) score += 15;
      else if (hours >= 1 && hours <= 6) score += 5;
    }
    
    // Booking convenience factor
    if (activity.bookingRequired === false) score += 5;
    
    return Math.max(0, score);
  }

  async generateRecommendations(results, task) {
    try {
      // Use parent class method first
      const aiResponse = await super.generateRecommendations(results, task);
      
      // Enhance with activity-specific metadata
      return {
        ...aiResponse,
        metadata: {
          ...aiResponse.metadata,
          source: 'ai',
          timestamp: new Date().toISOString(),
          totalResults: results ? results.length : 0,
          destination: task.criteria.destination || 'Unknown',
          searchCriteria: {
            interests: task.criteria.interests || [],
            budget: task.criteria.budget,
            travelersCount: task.criteria.travelersCount || 1,
            durationPreferences: task.criteria.durationPreferences || 'flexible'
          }
        }
      };
    } catch (error) {
      console.warn(`ActivityAgent generateRecommendations failed: ${error.message}. Using direct fallback.`);
      
      // Direct fallback structure when AI fails
      return {
        recommendations: results || [],
        confidence: 60,
        reasoning: 'Using fallback recommendations due to AI service unavailability. These are curated activities based on your criteria.',
        metadata: {
          source: 'fallback',
          timestamp: new Date().toISOString(),
          totalResults: results ? results.length : 0,
          destination: task.criteria.destination || 'Unknown',
          searchCriteria: {
            interests: task.criteria.interests || [],
            budget: task.criteria.budget,
            travelersCount: task.criteria.travelersCount || 1,
            durationPreferences: task.criteria.durationPreferences || 'flexible'
          }
        }
      };
    }
  }

}