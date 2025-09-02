// src/agents/accommodationAgent.js (final version with real API)
import { TripPlanningAgent } from './baseAgent.js';
import bookingService from '../services/bookingService.js';

export class AccommodationAgent extends TripPlanningAgent {
  constructor(aiConfig = {}) {
    super(
      'AccommodationAgent',
      ['hotel_search', 'pricing_analysis', 'amenity_matching'],
      aiConfig,
      {
        maxResults: 15,
        providers: ['rapidapi', 'booking.com']
      }
    );
  }

  async search(criteria) {
    try {
      console.log('AccommodationAgent searching with criteria:', criteria);
      
      // Validate required criteria
      if (!criteria.destination || !criteria.checkInDate || !criteria.checkOutDate) {
        throw new Error('Missing required accommodation criteria: destination, checkInDate, checkOutDate');
      }

      // Call RapidAPI via BookingService
      const searchParams = {
        destination: criteria.destination,
        checkIn: criteria.checkInDate,
        checkOut: criteria.checkOutDate,
        guests: criteria.guests || criteria.travelers || 1,
        maxResults: this.searchConfig.maxResults
      };

      const accommodations = await bookingService.searchHotels(searchParams);
      console.log(`Found ${accommodations.length} accommodations from RapidAPI`);

      // Apply client-side filtering
      return this.applyFilters(accommodations, criteria);
      
    } catch (error) {
      console.error('AccommodationAgent search error:', error);
      
      // Fallback to mock data if API fails (for development)
      if (process.env.NODE_ENV === 'development') {
        console.log('Falling back to mock data for development');
        return this.getMockAccommodations(criteria);
      }
      
      throw error;
    }
  }

  applyFilters(accommodations, criteria) {
    return accommodations.filter(accommodation => {
      // Price filter
      if (criteria.maxPrice && accommodation.price > criteria.maxPrice) {
        return false;
      }
      
      // Rating filter
      if (criteria.minRating && accommodation.rating < criteria.minRating) {
        return false;
      }
      
      // Accommodation type filter
      if (criteria.accommodationType && accommodation.type !== criteria.accommodationType) {
        return false;
      }
      
      // Required amenities filter
      if (criteria.requiredAmenities && criteria.requiredAmenities.length > 0) {
        const hasAllAmenities = criteria.requiredAmenities.every(
          amenity => accommodation.amenities.includes(amenity.toLowerCase())
        );
        if (!hasAllAmenities) return false;
      }
      
      return true;
    });
  }

  async rank(results) {
    // Enhanced ranking with real accommodation data
    return results.map(accommodation => ({
      ...accommodation,
      score: this.calculateAccommodationScore(accommodation)
    })).sort((a, b) => b.score - a.score);
  }

  calculateAccommodationScore(accommodation) {
    let score = 100;
    
    // Price factor (normalize to reasonable range - lower price = better score)
    const priceScore = Math.max(0, 50 - (accommodation.price / 10));
    score += priceScore;
    
    // Rating factor (big impact)
    score += (accommodation.rating * 15);
    
    // Location factor (closer to center = higher score)
    if (accommodation.location?.distance) {
      const distanceMatch = accommodation.location.distance.match(/(\d+\.?\d*)/);
      if (distanceMatch) {
        const distance = parseFloat(distanceMatch[1]);
        score -= (distance * 3);
      }
    }
    
    // Amenity bonus
    const premiumAmenities = ['pool', 'spa', 'gym', 'restaurant', 'bar', 'room-service'];
    const amenityBonus = accommodation.amenities?.filter(a => premiumAmenities.includes(a)).length * 5;
    score += amenityBonus;
    
    // Type preference
    if (accommodation.type === 'hotel') score += 10;
    if (accommodation.type === 'resort') score += 15;
    
    return Math.max(0, score);
  }

  // Keep mock data as fallback for development
  getMockAccommodations(criteria) {
    return [
      {
        id: 'MOCK_HTL001',
        name: 'Mock Grand Hotel',
        type: 'hotel',
        location: { 
          address: '123 Mock Street', 
          distance: '0.5 km from center',
          city: criteria.destination
        },
        price: 180,
        currency: 'USD',
        rating: 4.3,
        amenities: ['wifi', 'pool', 'gym', 'breakfast', 'parking'],
        description: 'Comfortable hotel in city center',
        images: [],
        availability: 'Available for selected dates'
      }
    ];
  }

  async generateRecommendations(results, task) {
    if (!results || results.length === 0) {
      return {
        recommendations: [],
        confidence: 0,
        reasoning: 'No accommodations found matching your criteria.',
        metadata: { searchCriteria: task.criteria }
      };
    }

    const prompt = `
You are a travel expert analyzing accommodation options. Here are the search criteria and results:

Search Criteria:
- Destination: ${task.criteria.destination}
- Check-in: ${task.criteria.checkInDate}
- Check-out: ${task.criteria.checkOutDate}
- Guests: ${task.criteria.guests || task.criteria.travelers || 1}
- Budget: ${task.criteria.maxPrice ? `$${task.criteria.maxPrice} max per night` : 'No limit'}
- Required amenities: ${task.criteria.requiredAmenities?.join(', ') || 'None specified'}

Accommodation Options (Top 5):
${JSON.stringify(results.slice(0, 5).map(h => ({
  name: h.name,
  type: h.type,
  price: h.price,
  currency: h.currency,
  rating: h.rating,
  location: { distance: h.location?.distance, address: h.location?.address?.substring(0, 50) },
  amenities: h.amenities?.slice(0, 8) // Top amenities only
})), null, 2)}

Please provide:
1. Your top 3 accommodation recommendations with clear reasoning
2. Key factors you considered (price, location, rating, amenities)
3. Any notable trade-offs or alternatives
4. Confidence score (0-100) based on options available

Be conversational and helpful, like a knowledgeable travel agent.
    `;

    try {
      const aiResponse = await this.generateStructuredResponse(prompt, this.resultSchema);
      
      return {
        recommendations: results.slice(0, 3), // Top 3 accommodations
        confidence: aiResponse.content.confidence || 85,
        reasoning: aiResponse.content.reasoning || 'Based on price, location, rating, and amenities.',
        metadata: {
          totalFound: results.length,
          searchCriteria: task.criteria,
          aiAnalysis: aiResponse.content
        }
      };
    } catch (error) {
      console.error('AI recommendation generation failed:', error);
      
      // Fallback to rule-based recommendations
      return {
        recommendations: results.slice(0, 3),
        confidence: 70,
        reasoning: `Found ${results.length} accommodations. Top options selected based on rating, location, and price.`,
        metadata: { searchCriteria: task.criteria, aiError: error.message }
      };
    }
  }
}