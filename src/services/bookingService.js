// src/services/bookingService.js (updated to use RapidAPI)
import rapidApiService from './rapidApiService.js';

class BookingService {
  constructor() {
    console.log('BookingService initialized (using RapidAPI backend)');
  }

  async searchHotels(searchParams) {
    try {
      console.log('BookingService delegating to RapidAPI:', searchParams);
      // Delegate to RapidAPI service
      return await rapidApiService.searchHotels(searchParams);
    } catch (error) {
      console.error('BookingService hotel search error:', error);
      throw error;
    }
  }

  // Future methods can be added here
  // async getHotelDetails(hotelId) { ... }
  // async checkAvailability(hotelId, dates) { ... }
}

export default new BookingService();