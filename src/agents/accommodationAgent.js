import { TripPlanningAgent } from './baseAgent.js';

export class AccommodationAgent extends TripPlanningAgent {
  constructor(aiConfig = {}) {
    super(
      'AccommodationAgent',
      ['hotel_search', 'pricing_analysis', 'amenity_matching'],
      aiConfig,
      {
        maxResults: 15,
        providers: ['booking.com', 'hotels.com', 'airbnb']
      }
    );
  }

  async search(criteria) {
    // Mock accommodation search - replace with actual API calls
    const mockAccommodations = [
      {
        id: 'HTL001',
        name: 'Grand Plaza Hotel',
        type: 'hotel',
        location: { address: '123 Main St', distance: '0.5 miles from city center' },
        price: 180,
        rating: 4.5,
        amenities: ['wifi', 'pool', 'gym', 'parking', 'breakfast'],
        rooms: 'Deluxe King Room',
        checkIn: criteria.checkInDate,
        checkOut: criteria.checkOutDate
      },
      {
        id: 'HTL002',
        name: 'Boutique Inn',
        type: 'hotel',
        location: { address: '456 Oak Ave', distance: '1.2 miles from city center' },
        price: 120,
        rating: 4.2,
        amenities: ['wifi', 'breakfast', 'parking'],
        rooms: 'Standard Queen Room',
        checkIn: criteria.checkInDate,
        checkOut: criteria.checkOutDate
      },
      {
        id: 'AIR001',
        name: 'Modern Downtown Apartment',
        type: 'airbnb',
        location: { address: '789 Pine St', distance: '0.3 miles from city center' },
        price: 95,
        rating: 4.8,
        amenities: ['wifi', 'kitchen', 'washer', 'parking'],
        rooms: 'Entire Apartment',
        checkIn: criteria.checkInDate,
        checkOut: criteria.checkOutDate
      }
    ];

    // Filter based on criteria
    return mockAccommodations.filter(accommodation => {
      if (criteria.maxPrice && accommodation.price > criteria.maxPrice) return false;
      if (criteria.minRating && accommodation.rating < criteria.minRating) return false;
      if (criteria.accommodationType && accommodation.type !== criteria.accommodationType) return false;
      if (criteria.requiredAmenities) {
        const hasAllAmenities = criteria.requiredAmenities.every(
          amenity => accommodation.amenities.includes(amenity)
        );
        if (!hasAllAmenities) return false;
      }
      return true;
    });
  }

  async rank(results) {
    return results.map(accommodation => ({
      ...accommodation,
      score: this.calculateAccommodationScore(accommodation)
    })).sort((a, b) => b.score - a.score);
  }

  calculateAccommodationScore(accommodation) {
    let score = 100;
    
    // Price factor (lower price = higher score)
    score -= (accommodation.price / 5);
    
    // Rating factor
    score += (accommodation.rating * 10);
    
    // Location factor (closer to center = higher score)
    const distance = parseFloat(accommodation.location.distance.split(' ')[0]);
    score -= (distance * 5);
    
    // Amenity bonus
    score += (accommodation.amenities.length * 2);
    
    // Type preference (hotels slightly preferred for reliability)
    if (accommodation.type === 'hotel') score += 5;
    
    return Math.max(0, score);
  }
}