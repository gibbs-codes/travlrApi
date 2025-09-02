// Alternative: src/services/rapidApiService.js
// Only implement this if you want to try RapidAPI instead

class RapidApiHotelService {
  constructor() {
    this.apiKey = process.env.RAPIDAPI_KEY;
    this.baseUrl = 'https://booking-com.p.rapidapi.com/v1';
  }

  async searchHotels(searchParams) {
    if (!this.apiKey) {
      throw new Error('RapidAPI key not configured');
    }

    try {
      const { destination, checkIn, checkOut, guests } = searchParams;
      
      const response = await fetch(`${this.baseUrl}/hotels/search`, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': 'booking-com.p.rapidapi.com'
        },
        params: {
          dest_id: destination,
          search_type: 'city',
          arrival_date: checkIn,
          departure_date: checkOut,
          adults: guests
        }
      });

      if (!response.ok) {
        throw new Error(`RapidAPI error: ${response.status}`);
      }

      const data = await response.json();
      return this.transformHotelData(data.result);
    } catch (error) {
      console.error('RapidAPI hotel search error:', error);
      throw error;
    }
  }

  transformHotelData(hotelData) {
    // Transform RapidAPI data to your standard format
    return hotelData.map(hotel => ({
      id: hotel.hotel_id,
      name: hotel.hotel_name,
      type: 'hotel',
      price: hotel.min_total_price,
      rating: hotel.review_score,
      // ... etc
    }));
  }
}

export default new RapidApiHotelService();