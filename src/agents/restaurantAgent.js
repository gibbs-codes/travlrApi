import { TripPlanningAgent } from './baseAgent.js';
import googlePlacesService from '../services/googlePlacesService.js';

export class RestaurantAgent extends TripPlanningAgent {
  constructor(aiConfig = {}) {
    super(
      'RestaurantAgent',
      ['restaurant_search', 'cuisine_matching', 'reservation_optimization'],
      aiConfig,
      {
        maxResults: 12,
        providers: ['google_places', 'yelp', 'opentable', 'tripadvisor']
      }
    );

    this.mockRestaurants = [
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
  }

  async search(criteria) {
    try {
      const {
        destination,
        cuisines = [],
        priceRange,
        minRating = 0,
        maxDistance = 5, // km
        features = [],
        openNow = false
      } = criteria;

      if (!destination) {
        throw new Error('Destination is required for restaurant search');
      }

      // Step 1: Convert destination to coordinates
      this.logInfo(`🔍 RestaurantAgent: Converting "${destination}" to coordinates...`);
      const location = await googlePlacesService.geocodeDestination(destination);
      this.logInfo(`✅ RestaurantAgent: Found coordinates: ${location.lat}, ${location.lng}`);

      // Step 2: Build search options
      const searchOptions = {
        radius: maxDistance * 1000, // Convert km to meters
        opennow: openNow
      };

      // Add cuisine keyword if specified
      if (cuisines.length > 0) {
        searchOptions.keyword = cuisines.join(' ');
      }

      // Convert our price range to Google's price levels (0-4)
      if (priceRange) {
        const priceMapping = {
          '$': { minprice: 0, maxprice: 1 },
          '$$': { minprice: 1, maxprice: 2 },
          '$$$': { minprice: 2, maxprice: 3 },
          '$$$$': { minprice: 3, maxprice: 4 }
        };
        
        if (priceMapping[priceRange]) {
          searchOptions.minprice = priceMapping[priceRange].minprice;
          searchOptions.maxprice = priceMapping[priceRange].maxprice;
        }
      }

      // Step 3: Search for restaurants
      this.logInfo(`🔍 RestaurantAgent: Searching restaurants with options:`, searchOptions);
      const { restaurants: googleRestaurants } = await googlePlacesService.searchNearbyRestaurants(
        location, 
        searchOptions
      );

      if (!googleRestaurants || googleRestaurants.length === 0) {
        throw new Error('No restaurants found for the given criteria');
      }

      // Step 4: Convert to our schema and apply additional filtering
      this.logInfo(`✅ RestaurantAgent: Found ${googleRestaurants.length} restaurants from Google Places`);
      
      let restaurants = googleRestaurants
        .map(googlePlace => googlePlacesService.convertToSchema(googlePlace))
        .filter(restaurant => {
          // Apply additional client-side filtering
          if (minRating && restaurant.rating < minRating) return false;
          
          // Filter by cuisine if specified (Google's keyword search might not be perfect)
          if (cuisines.length > 0) {
            const cuisineMatch = cuisines.some(cuisine => 
              restaurant.cuisine.toLowerCase().includes(cuisine.toLowerCase()) ||
              cuisine.toLowerCase().includes(restaurant.cuisine.toLowerCase())
            );
            if (!cuisineMatch) return false;
          }

          // Filter by features if specified
          if (features.length > 0) {
            const hasRequiredFeatures = features.some(feature => 
              restaurant.features.includes(feature)
            );
            if (!hasRequiredFeatures) return false;
          }

          return true;
        })
        .slice(0, this.searchConfig.maxResults); // Limit results

      this.logInfo(`✅ RestaurantAgent: Returning ${restaurants.length} filtered restaurants`);
      return restaurants;

    } catch (error) {
      this.logWarn(`RestaurantAgent Google Places search failed: ${error.message}. Falling back to mock data.`);
      
      // Handle specific Google API errors
      if (error.message.includes('OVER_QUERY_LIMIT')) {
        this.logWarn('Google Places API quota exceeded. Consider upgrading your plan.');
      } else if (error.message.includes('REQUEST_DENIED')) {
        this.logWarn('Google Places API request denied. Check your API key and billing.');
      } else if (error.message.includes('INVALID_REQUEST')) {
        this.logWarn('Invalid request to Google Places API. Check parameters.');
      }

      return this.getMockRestaurants(criteria);
    }
  }

  getMockRestaurants(criteria) {
    const {
      cuisines = [],
      priceRange,
      minRating = 0,
      features = []
    } = criteria;

    return this.mockRestaurants.filter(restaurant => {
      if (cuisines.length > 0 && !cuisines.includes(restaurant.cuisine)) return false;
      if (priceRange && restaurant.priceRange !== priceRange) return false;
      if (minRating && restaurant.rating < minRating) return false;
      if (features.length > 0) {
        const hasRequiredFeatures = features.every(
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

    // Rating factor (more important for Google Places data)
    if (restaurant.rating && restaurant.rating > 0) {
      score += (restaurant.rating * 25);
    }

    // Price factor (moderate pricing preferred)
    const priceMultiplier = { '$': 15, '$$': 20, '$$$': 10, '$$$$': 5 };
    score += (priceMultiplier[restaurant.priceRange] || 0);

    // Distance factor (for Google Places, we don't have exact distance but can use location data)
    // This is a placeholder - could be enhanced with actual distance calculation

    // Features bonus
    if (restaurant.features && Array.isArray(restaurant.features)) {
      score += (restaurant.features.length * 3);
    }

    // Reservation availability
    if (restaurant.reservations) score += 10;

    // Cuisine diversity bonus
    const popularCuisines = ['Italian', 'French', 'Japanese', 'Mediterranean', 'Chinese', 'Mexican'];
    if (popularCuisines.includes(restaurant.cuisine)) score += 8;

    // Bonus for highly rated restaurants
    if (restaurant.rating >= 4.5) score += 15;
    if (restaurant.rating >= 4.0) score += 10;

    // Bonus for restaurants with photos (indicates more complete Google Places data)
    if (restaurant.photos && restaurant.photos.length > 0) score += 5;

    return Math.max(0, score);
  }

  async generateRecommendations(results, task) {
    const startTime = Date.now();
    this.logInfo('🎯 RestaurantAgent.generateRecommendations: Starting');
    this.logInfo(`   Input: ${results ? results.length : 0} results`);

    if (!results || results.length === 0) {
      this.logWarn('⚠️ RestaurantAgent: No results to transform');
      return {
        content: {
          recommendations: [],
          confidence: 0,
          reasoning: 'No restaurants found matching your criteria.'
        },
        metadata: { searchCriteria: task.criteria }
      };
    }

    this.logInfo('🔍 RestaurantAgent: Transforming Google Places data...');

    // Transform Google Places schema to TripOrchestrator recommendation format
    const recommendations = results.slice(0, 5).map((restaurant, index) => {
      this.logInfo(`   Processing restaurant ${index + 1}:`, {
        name: restaurant.name,
        rating: restaurant.rating,
        priceRange: restaurant.priceRange,
        cuisine: restaurant.cuisine,
        address: restaurant.location?.address,
        hasPhotos: !!(restaurant.photos && restaurant.photos.length > 0),
        hasCoordinates: !!(restaurant.location?.coordinates?.lat && restaurant.location?.coordinates?.lng)
      });

      const recommendation = {
        id: restaurant.id,
        name: restaurant.name || 'Unknown Restaurant',
        description: `${restaurant.cuisine} restaurant${restaurant.location?.address ? ` at ${restaurant.location.address}` : ''}`,
        price: {
          amount: restaurant.averageMeal || 0,
          currency: task.criteria?.currency || 'USD',
          priceType: 'per_person'
        },
        rating: {
          score: restaurant.rating || 0,
          reviewCount: restaurant.reviewCount || restaurant.user_ratings_total || 0,
          source: 'Google Places'
        },
        location: {
          address: restaurant.location?.address,
          city: task.criteria?.destination,
          coordinates: restaurant.location?.coordinates
        },
        images: restaurant.photos && restaurant.photos.length > 0
          ? restaurant.photos.map(photo => photo.url)
          : [],
        agentMetadata: {
          cuisine: restaurant.cuisine,
          priceRange: restaurant.priceRange,
          features: restaurant.features || [],
          hours: restaurant.hours,
          reservations: restaurant.reservations,
          placeId: restaurant.id
        }
      };

      this.logInfo(`   ✅ Created recommendation:`, {
        name: recommendation.name,
        description: recommendation.description.substring(0, 60) + '...',
        price: `${recommendation.price.currency} ${recommendation.price.amount}`,
        rating: `${recommendation.rating.score}/5 (${recommendation.rating.reviewCount} reviews)`,
        hasImages: recommendation.images.length > 0,
        imageCount: recommendation.images.length,
        hasCoordinates: !!recommendation.location.coordinates,
        coordinates: recommendation.location.coordinates
      });

      return recommendation;
    });

    const duration = Date.now() - startTime;
    this.logInfo(`✅ RestaurantAgent: Transformed ${recommendations.length} recommendations in ${duration}ms`);

    return {
      content: {
        recommendations,
        confidence: 85,
        reasoning: `Found ${results.length} restaurants. Recommendations based on ratings, cuisine variety, and location.`
      },
      metadata: {
        totalFound: results.length,
        searchCriteria: task.criteria,
        source: 'Google Places'
      }
    };
  }

}