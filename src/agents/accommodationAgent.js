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
    // Enhanced mock accommodation search with dynamic data
    const destinationData = this.getDestinationAccommodations(criteria.destination);
    const basePrices = destinationData.priceRange;
    
    const mockAccommodations = [
      {
        id: 'HTL001',
        name: `${destinationData.hotelPrefix} Grand Plaza Hotel`,
        type: 'hotel',
        location: { 
          address: `123 ${destinationData.streetName}`, 
          distance: '0.5 miles from city center',
          neighborhood: destinationData.area1 
        },
        price: basePrices.luxury,
        rating: 4.5,
        amenities: ['wifi', 'pool', 'gym', 'parking', 'breakfast', 'spa', 'concierge', 'room-service'],
        rooms: 'Deluxe King Room with City View',
        checkIn: criteria.checkInDate,
        checkOut: criteria.checkOutDate,
        photos: 3,
        description: `Luxury hotel in the heart of ${criteria.destination} with premium amenities`,
        cancellation: 'Free cancellation until 24h before check-in'
      },
      {
        id: 'HTL002',
        name: `${destinationData.area2} Boutique Inn`,
        type: 'hotel',
        location: { 
          address: `456 ${destinationData.streetName2}`, 
          distance: '1.2 miles from city center',
          neighborhood: destinationData.area2 
        },
        price: basePrices.mid,
        rating: 4.2,
        amenities: ['wifi', 'breakfast', 'parking', 'fitness-center'],
        rooms: 'Standard Queen Room',
        checkIn: criteria.checkInDate,
        checkOut: criteria.checkOutDate,
        photos: 2,
        description: 'Charming boutique hotel with personalized service',
        cancellation: 'Free cancellation until 48h before check-in'
      },
      {
        id: 'HTL003',
        name: `${destinationData.hotelPrefix} Business Hotel`,
        type: 'hotel',
        location: { 
          address: `789 Business District`, 
          distance: '2.1 miles from city center',
          neighborhood: 'Financial District' 
        },
        price: basePrices.budget + 40,
        rating: 4.0,
        amenities: ['wifi', 'business-center', 'parking', '24h-front-desk'],
        rooms: 'Executive Double Room',
        checkIn: criteria.checkInDate,
        checkOut: criteria.checkOutDate,
        photos: 2,
        description: 'Modern business hotel with excellent connectivity',
        cancellation: 'Free cancellation until 72h before check-in'
      },
      {
        id: 'AIR001',
        name: `Modern ${destinationData.area1} Apartment`,
        type: 'airbnb',
        location: { 
          address: `321 ${destinationData.streetName}`, 
          distance: '0.3 miles from city center',
          neighborhood: destinationData.area1 
        },
        price: basePrices.budget + 20,
        rating: 4.8,
        amenities: ['wifi', 'kitchen', 'washer', 'parking', 'balcony'],
        rooms: 'Entire 2BR Apartment',
        checkIn: criteria.checkInDate,
        checkOut: criteria.checkOutDate,
        photos: 4,
        description: 'Stylish apartment with full kitchen and great location',
        cancellation: 'Moderate cancellation policy',
        hostRating: 4.9,
        instantBook: true
      },
      {
        id: 'AIR002',
        name: `Cozy ${destinationData.area2} Studio`,
        type: 'airbnb',
        location: { 
          address: `654 ${destinationData.streetName2}`, 
          distance: '0.8 miles from city center',
          neighborhood: destinationData.area2 
        },
        price: basePrices.budget,
        rating: 4.6,
        amenities: ['wifi', 'kitchen', 'washer', 'workspace'],
        rooms: 'Private Studio',
        checkIn: criteria.checkInDate,
        checkOut: criteria.checkOutDate,
        photos: 3,
        description: 'Perfect for solo travelers or couples, fully equipped',
        cancellation: 'Flexible cancellation',
        hostRating: 4.7,
        instantBook: false
      },
      {
        id: 'HTL004',
        name: `${destinationData.hotelPrefix} Luxury Resort`,
        type: 'resort',
        location: { 
          address: `1 Resort Way`, 
          distance: '3.5 miles from city center',
          neighborhood: 'Resort District' 
        },
        price: basePrices.luxury + 100,
        rating: 4.7,
        amenities: ['wifi', 'pool', 'spa', 'gym', 'restaurants', 'bar', 'valet-parking', '24h-room-service', 'golf'],
        rooms: 'Deluxe Resort Suite',
        checkIn: criteria.checkInDate,
        checkOut: criteria.checkOutDate,
        photos: 5,
        description: 'Ultimate luxury resort experience with world-class amenities',
        cancellation: 'Free cancellation until 48h before check-in'
      },
      {
        id: 'HST001',
        name: `${destinationData.area1} Backpacker Hostel`,
        type: 'hostel',
        location: { 
          address: `987 Backpacker St`, 
          distance: '0.7 miles from city center',
          neighborhood: destinationData.area1 
        },
        price: basePrices.budget - 40,
        rating: 4.1,
        amenities: ['wifi', 'shared-kitchen', 'common-room', 'lockers', 'laundry'],
        rooms: 'Private Room in Hostel',
        checkIn: criteria.checkInDate,
        checkOut: criteria.checkOutDate,
        photos: 2,
        description: 'Clean, safe hostel perfect for budget travelers',
        cancellation: 'Free cancellation until 24h before check-in'
      },
      {
        id: 'BB001',
        name: `${destinationData.area2} Family B&B`,
        type: 'bed-breakfast',
        location: { 
          address: `555 Residential Ave`, 
          distance: '1.5 miles from city center',
          neighborhood: destinationData.area2 
        },
        price: basePrices.mid - 30,
        rating: 4.4,
        amenities: ['wifi', 'breakfast', 'parking', 'garden', 'pet-friendly'],
        rooms: 'Cozy Double Room',
        checkIn: criteria.checkInDate,
        checkOut: criteria.checkOutDate,
        photos: 3,
        description: 'Warm family-run B&B with homemade breakfast',
        cancellation: 'Free cancellation until 48h before check-in'
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

  getDestinationAccommodations(destination) {
    const destinationMap = {
      'Paris': {
        hotelPrefix: 'Le',
        area1: 'Champs-Élysées',
        area2: 'Marais',
        streetName: 'Rue de Rivoli',
        streetName2: 'Boulevard Saint-Germain',
        priceRange: { budget: 80, mid: 150, luxury: 280 }
      },
      'London': {
        hotelPrefix: 'The',
        area1: 'Covent Garden',
        area2: 'Shoreditch',
        streetName: 'Oxford Street',
        streetName2: 'King\'s Road',
        priceRange: { budget: 90, mid: 160, luxury: 320 }
      },
      'Tokyo': {
        hotelPrefix: 'Tokyo',
        area1: 'Shibuya',
        area2: 'Asakusa',
        streetName: 'Ginza Street',
        streetName2: 'Omotesando Avenue',
        priceRange: { budget: 70, mid: 140, luxury: 350 }
      },
      'New York': {
        hotelPrefix: 'Manhattan',
        area1: 'Times Square',
        area2: 'SoHo',
        streetName: 'Broadway',
        streetName2: 'Fifth Avenue',
        priceRange: { budget: 120, mid: 220, luxury: 450 }
      },
      'Rome': {
        hotelPrefix: 'Roma',
        area1: 'Trastevere',
        area2: 'Spanish Steps',
        streetName: 'Via del Corso',
        streetName2: 'Via Veneto',
        priceRange: { budget: 75, mid: 135, luxury: 260 }
      }
    };

    const key = Object.keys(destinationMap).find(city => 
      destination.toLowerCase().includes(city.toLowerCase())
    );
    
    return destinationMap[key] || {
      hotelPrefix: 'City',
      area1: 'Downtown',
      area2: 'Historic District',
      streetName: 'Main Street',
      streetName2: 'Central Avenue',
      priceRange: { budget: 80, mid: 150, luxury: 280 }
    };
  }
}