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
        description: 'Explore the historic downtown area with a local guide. Learn about the city\'s rich history, architecture, and hidden gems.',
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
        description: 'Taste local specialties and learn about regional cuisine. Visit artisan food stalls and meet local producers.',
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
        description: 'Challenging hike with scenic views and wildlife spotting. Experience breathtaking landscapes and natural beauty.',
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
        description: 'Access to three major art museums in the city. Discover world-class collections and temporary exhibitions.',
        category: 'art',
        duration: 'self-paced',
        price: 25,
        rating: 4.3,
        location: 'Museum District',
        bookingRequired: false
      },
      {
        id: 'ACT005',
        name: 'Local Market Shopping Tour',
        description: 'Browse colorful markets and shop for unique souvenirs. Interact with local vendors and learn bargaining techniques.',
        category: 'shopping',
        duration: '2 hours',
        price: 30,
        rating: 4.5,
        location: 'Old Town Market Square',
        bookingRequired: false
      },
      {
        id: 'ACT006',
        name: 'Sunset Boat Cruise',
        description: 'Enjoy stunning views from the water as the sun sets. Includes complimentary drinks and snacks.',
        category: 'entertainment',
        duration: '2 hours',
        price: 55,
        rating: 4.7,
        location: 'Harbor Marina',
        bookingRequired: true
      },
      {
        id: 'ACT007',
        name: 'Historical Landmark Tour',
        description: 'Visit iconic historical sites with expert commentary. Skip-the-line access to major attractions included.',
        category: 'historical',
        duration: '4 hours',
        price: 70,
        rating: 4.6,
        location: 'Historic City Center',
        bookingRequired: true
      },
      {
        id: 'ACT008',
        name: 'Park Picnic & Leisure',
        description: 'Relax in beautiful green spaces perfect for a casual afternoon. Great for families and those seeking a slower pace.',
        category: 'nature',
        duration: 'flexible',
        price: 0,
        rating: 4.4,
        location: 'Central Park',
        bookingRequired: false
      }
    ];
  }

  async search(criteria) {
    const startTime = Date.now();
    console.log('🎯 ActivityAgent.search: Starting');
    console.log('🎯 ActivityAgent.search: Criteria:', JSON.stringify({
      destination: criteria.destination,
      interests: criteria.interests,
      travelersCount: criteria.travelersCount,
      budget: criteria.budget,
      preferredArea: criteria.preferredArea,
      executionContext: !!criteria.executionContext,
      tripId: criteria.tripId
    }, null, 2));

    try {
      console.log('🔍 ActivityAgent.search: Step 1 - Building AI prompt...');
      const prompt = this.buildActivitySearchPrompt(criteria);
      console.log('📝 ActivityAgent.search: Prompt length:', prompt.length, 'characters');

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

      console.log('🔍 ActivityAgent.search: Step 2 - Calling AI provider...');
      console.log('   AI Provider:', this.aiProvider?.constructor?.name || 'Unknown');
      const aiStartTime = Date.now();

      const response = await this.generateStructuredResponse(prompt, activitySchema);

      const aiDuration = Date.now() - aiStartTime;
      console.log(`⏱️ ActivityAgent.search: AI call completed in ${aiDuration}ms`);
      console.log('📊 ActivityAgent.search: Response type:', typeof response);
      
      console.log('🔍 ActivityAgent.search: Step 3 - Parsing AI response...');

      // More robust response parsing
      let recommendations = null;

      if (response) {
        console.log('   Response has keys:', Object.keys(response));

        // Try different possible response structures
        if (response.content && response.content.recommendations && Array.isArray(response.content.recommendations)) {
          recommendations = response.content.recommendations;
          console.log('   ✅ Found recommendations in response.content.recommendations');
        } else if (response.recommendations && Array.isArray(response.recommendations)) {
          recommendations = response.recommendations;
          console.log('   ✅ Found recommendations in response.recommendations');
        } else if (response.content && response.content.activities && Array.isArray(response.content.activities)) {
          recommendations = response.content.activities;
          console.log('   ✅ Found recommendations in response.content.activities');
        } else if (response.activities && Array.isArray(response.activities)) {
          recommendations = response.activities;
          console.log('   ✅ Found recommendations in response.activities');
        } else if (Array.isArray(response)) {
          recommendations = response;
          console.log('   ✅ Response is array');
        } else {
          console.error('   ❌ Could not find recommendations in response structure');
          console.error('   Response structure:', JSON.stringify(response, null, 2).substring(0, 500));
        }
      } else {
        console.error('   ❌ Response is null/undefined');
      }

      if (recommendations && Array.isArray(recommendations) && recommendations.length > 0) {
        console.log(`✅ ActivityAgent.search: Found ${recommendations.length} recommendations`);

        // Sanitize price data - convert "N/A" or invalid strings to null
        console.log('🔍 ActivityAgent.search: Step 4 - Sanitizing data...');
        const sanitized = recommendations.map(activity => {
          const sanitizedActivity = { ...activity };

          // Handle price field
          if (activity.price === 'N/A' || activity.price === 'n/a' || typeof activity.price === 'string') {
            sanitizedActivity.price = null;
            console.log(`⚠️ Sanitized price for ${activity.name}: "${activity.price}" → null`);
          } else if (activity.price === undefined || activity.price === null) {
            sanitizedActivity.price = null;
          }

          return sanitizedActivity;
        });

        const totalDuration = Date.now() - startTime;
        console.log(`✅ ActivityAgent.search: Completed successfully in ${totalDuration}ms`);
        return sanitized;
      } else {
        console.error(`❌ ActivityAgent.search: AI returned empty or invalid recommendations`);
        console.warn('   Falling back to mock activities immediately');

        const mockData = this.getMockActivities(criteria);
        console.log(`📊 ActivityAgent.search: Returning ${mockData.length} mock activities as fallback`);
        return mockData;
      }
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      console.error(`❌ ActivityAgent.search: Failed after ${totalDuration}ms`);
      console.error(`   Error: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
      console.warn(`⚠️ ActivityAgent AI search failed: ${error.message}. Falling back to mock data.`);

      const mockData = this.getMockActivities(criteria);
      console.log(`📊 ActivityAgent.search: Returning ${mockData.length} mock activities as fallback`);
      return mockData;
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
    console.log('🎯 ActivityAgent.getMockActivities: Starting');
    console.log('   Total mock activities available:', this.mockActivities.length);
    console.log('   Filter criteria:', {
      budget: criteria.budget,
      interests: criteria.interests,
      destination: criteria.destination
    });

    // First try to filter by criteria
    const filtered = this.mockActivities.filter(activity => {
      if (criteria.budget && activity.price > criteria.budget) {
        console.log(`   ❌ Filtered out ${activity.name}: price ${activity.price} > budget ${criteria.budget}`);
        return false;
      }
      if (criteria.interests && criteria.interests.length > 0) {
        const hasMatchingInterest = criteria.interests.some(interest =>
          activity.category.toLowerCase().includes(interest.toLowerCase()) ||
          activity.description.toLowerCase().includes(interest.toLowerCase())
        );
        if (!hasMatchingInterest) {
          console.log(`   ❌ Filtered out ${activity.name}: no matching interests`);
          return false;
        }
      }
      console.log(`   ✅ Included ${activity.name}`);
      return true;
    });

    // FALLBACK: If filtering returns nothing, return at least 3 activities
    if (filtered.length === 0) {
      console.warn('⚠️ ActivityAgent.getMockActivities: Filtering returned 0 results!');
      console.warn('   Returning first 3 mock activities as guaranteed fallback');
      const fallbackActivities = this.mockActivities.slice(0, 3);
      console.log(`📊 ActivityAgent.getMockActivities: Returning ${fallbackActivities.length} fallback activities`);
      return fallbackActivities;
    }

    console.log(`📊 ActivityAgent.getMockActivities: Returning ${filtered.length}/${this.mockActivities.length} activities`);
    return filtered;
  }

  async rank(results) {
    console.log('🎯 ActivityAgent.rank: Starting');
    console.log(`   Input: ${results ? (Array.isArray(results) ? results.length : 'not array') : 'null'} results`);

    if (!results || !Array.isArray(results)) {
      console.warn('⚠️ ActivityAgent.rank: Results is not an array, returning as-is');
      return results;
    }

    if (results.length === 0) {
      console.warn('⚠️ ActivityAgent.rank: Results array is empty');
      return results;
    }

    console.log('🔍 ActivityAgent.rank: Calculating scores and sorting...');
    const ranked = results.map(activity => ({
      ...activity,
      score: this.calculateActivityScore(activity)
    })).sort((a, b) => b.score - a.score);

    console.log(`✅ ActivityAgent.rank: Ranked ${ranked.length} activities`);
    if (ranked.length > 0) {
      console.log(`   Top activity: ${ranked[0].name} (score: ${ranked[0].score})`);
    }

    return ranked;
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
    const startTime = Date.now();
    console.log('🎯 ActivityAgent.generateRecommendations: Starting');
    console.log(`   Input: ${results ? results.length : 0} results`);
    console.log('   Task criteria:', {
      destination: task.criteria?.destination,
      interests: task.criteria?.interests,
      budget: task.criteria?.budget
    });

    try {
      console.log('🔍 ActivityAgent.generateRecommendations: Calling parent class method...');
      const aiStartTime = Date.now();

      // Use parent class method first
      const aiResponse = await super.generateRecommendations(results, task);

      const aiDuration = Date.now() - aiStartTime;
      console.log(`⏱️ ActivityAgent.generateRecommendations: Parent method completed in ${aiDuration}ms`);
      console.log('   Response type:', typeof aiResponse);
      console.log('   Response keys:', aiResponse ? Object.keys(aiResponse) : 'null');

      // Enhance with activity-specific metadata
      const enhanced = {
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

      const totalDuration = Date.now() - startTime;
      console.log(`✅ ActivityAgent.generateRecommendations: Completed successfully in ${totalDuration}ms`);

      return enhanced;
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      console.error(`❌ ActivityAgent.generateRecommendations: Failed after ${totalDuration}ms`);
      console.error(`   Error: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
      console.warn(`⚠️ ActivityAgent generateRecommendations failed: ${error.message}. Using direct fallback.`);

      // Direct fallback structure when AI fails
      const fallback = {
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

      console.log(`📊 ActivityAgent.generateRecommendations: Returning fallback with ${fallback.recommendations.length} items`);
      return fallback;
    }
  }

}