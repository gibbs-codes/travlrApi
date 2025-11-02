// src/services/bookingService.js (updated to use RapidAPI)
import rapidApiService from './rapidApiService.js';
import logger from '../utils/logger.js';

const log = logger.child({ scope: 'BookingService' });

class BookingService {
  constructor() {
    log.info('BookingService initialized (using RapidAPI backend)');
  }

  async searchHotels(searchParams) {
    try {
      log.debug('BookingService delegating to RapidAPI', searchParams);
      // Delegate to RapidAPI service
      return await rapidApiService.searchHotels(searchParams);
    } catch (error) {
      log.error('BookingService hotel search error', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  // Future methods can be added here
  // async getHotelDetails(hotelId) { ... }
  // async checkAvailability(hotelId, dates) { ... }
}

export default new BookingService();
