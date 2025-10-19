class RapidApiHotelService {
  constructor() {
    this.baseUrl = 'https://booking-com.p.rapidapi.com/v1';
    this.apiKey = null;
    this.isEnabled = false;
  }

  getApiKey() {
    if (!this.apiKey) {
      this.apiKey = process.env.RAPIDAPI_KEY;
      
      if (!this.apiKey) {
        console.error('❌ RAPIDAPI_KEY not found in environment variables');
        this.isEnabled = false;
        return null;
      }
      
      this.isEnabled = true;
      console.log('✅ RapidAPI key loaded successfully');
    }
    
    return this.apiKey;
  }

  async searchHotels(searchParams) {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new Error('RapidAPI service not configured - missing RAPIDAPI_KEY in .env file');
    }

    try {
      const {
        destination,
        checkIn,
        checkOut,
        guests = 1,
        maxResults = 10,
        currency = 'USD' // Allow currency to be specified in search params
      } = searchParams;

      console.log('Searching hotels via RapidAPI:', { destination, checkIn, checkOut, currency });

      const destId = this.getDestinationId(destination);
      console.log(`Using destination ID: ${destId} for ${destination}`);

      // Build query parameters with the EXACT field names the API expects
      const queryParams = new URLSearchParams({
        // Required fields based on the error message
        locale: 'en-gb',
        dest_type: 'city',
        dest_id: destId,
        filter_by_currency: currency,
        order_by: 'popularity',
        checkin_date: checkIn,
        checkout_date: checkOut,
        room_number: '1',
        adults_number: guests.toString(),

        // Optional but useful fields
        units: 'metric',
        page_number: '0',
        include_adjacency: 'true'
      });

      const url = `${this.baseUrl}/hotels/search?${queryParams}`;
      console.log('RapidAPI Request URL:', url);
      console.log(`💱 Requesting prices in: ${currency}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'booking-com.p.rapidapi.com'
        }
      });

      console.log('RapidAPI Response Status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('RapidAPI Error Response:', errorText);

        if (response.status === 422) {
          throw new Error(`RapidAPI validation error - check required parameters: ${errorText}`);
        }

        throw new Error(`RapidAPI error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      console.log('RapidAPI Response Data Keys:', Object.keys(data));

      if (!data.result || !Array.isArray(data.result)) {
        console.warn('Unexpected API response structure:', data);
        throw new Error(`No hotels found for destination: ${destination}`);
      }

      if (data.result.length === 0) {
        throw new Error(`No hotels available for ${destination} on ${checkIn} to ${checkOut}`);
      }

      console.log(`Found ${data.result.length} raw hotels from RapidAPI`);

      const hotels = this.transformHotelData(data.result, currency);
      console.log(`Successfully transformed ${hotels.length} hotels`);

      // Log currency summary
      const currencyCounts = hotels.reduce((acc, hotel) => {
        acc[hotel.currency] = (acc[hotel.currency] || 0) + 1;
        return acc;
      }, {});
      console.log(`💱 Currency breakdown:`, currencyCounts);

      return hotels.slice(0, maxResults);

    } catch (error) {
      console.error('RapidAPI hotel search error:', error);

      if (error.message.includes('401') || error.message.includes('403')) {
        throw new Error('RapidAPI authentication failed. Check your API key and subscription.');
      }
      if (error.message.includes('429')) {
        throw new Error('RapidAPI rate limit exceeded. Please try again later.');
      }
      if (error.message.includes('422')) {
        throw new Error('RapidAPI parameter validation failed. API requirements may have changed.');
      }

      throw new Error(`Hotel search failed: ${error.message}`);
    }
  }

  getDestinationId(destination) {
    // Booking.com destination IDs for major cities
    const destinationMap = {
      'paris': '-1456928',
      'london': '-2601889',
      'new york': '20088325',
      'tokyo': '-246227',
      'rome': '-126693',
      'barcelona': '-372490',
      'amsterdam': '-2140479',
      'berlin': '-1746443',
      'madrid': '-390625',
      'lisbon': '-2167973',
      'prague': '-553173',
      'vienna': '-1995499',
      'florence': '-117543',
      'venice': '-118114',
      'milan': '-127310',
      'munich': '-1829149',
      'zurich': '-2657896'
    };

    const key = destination.toLowerCase().trim();
    console.log(`Looking up destination ID for: "${key}"`);
    
    if (destinationMap[key]) {
      console.log(`Found destination ID: ${destinationMap[key]}`);
      return destinationMap[key];
    }

    // Fallback to Paris if destination not found
    console.warn(`Destination "${destination}" not found in mapping. Using Paris as fallback.`);
    return '-1456928'; // Paris
  }

  transformHotelData(hotelData, requestedCurrency = 'USD') {
    return hotelData.map(hotel => {
      // Handle different price formats from the API
      let price = 0;
      let detectedCurrency = 'USD';

      // Extract price and currency from various API response formats
      if (hotel.composite_price_breakdown?.gross_amount_per_night?.value) {
        price = hotel.composite_price_breakdown.gross_amount_per_night.value;
        detectedCurrency = hotel.composite_price_breakdown.gross_amount_per_night.currency ||
                          hotel.composite_price_breakdown.currency_code || 'USD';
      } else if (hotel.min_total_price) {
        price = hotel.min_total_price;
        detectedCurrency = hotel.currencycode || hotel.currency || 'USD';
      } else if (hotel.price_breakdown?.gross_price) {
        price = hotel.price_breakdown.gross_price;
        detectedCurrency = hotel.price_breakdown.currency || hotel.currencycode || 'USD';
      } else if (hotel.gross_amount_per_night) {
        price = hotel.gross_amount_per_night;
        detectedCurrency = hotel.currencycode || hotel.currency || 'USD';
      }

      // Normalize currency code
      const normalizedCurrency = (detectedCurrency || 'USD').toString().toUpperCase();

      // Warn if currency doesn't match requested currency
      if (normalizedCurrency !== requestedCurrency) {
        console.warn(`⚠️ Currency mismatch for ${hotel.hotel_name}: expected ${requestedCurrency}, got ${normalizedCurrency}. Price: ${price}`);
      }

      // Handle rating (convert from 0-100 to 0-10 scale)
      let rating = 0;
      if (hotel.review_score) {
        rating = hotel.review_score / 10;
      } else if (hotel.scored) {
        rating = hotel.scored / 10;
      } else if (hotel.review_score_word) {
        // Sometimes rating comes as words, convert to numbers
        const ratingMap = {
          'exceptional': 9.5,
          'wonderful': 9.0,
          'excellent': 8.5,
          'very good': 8.0,
          'good': 7.5,
          'pleasant': 7.0,
          'satisfactory': 6.5
        };
        rating = ratingMap[hotel.review_score_word.toLowerCase()] || 7.0;
      }

      // Construct booking URL - prefer direct URL if available, otherwise construct Booking.com link
      const hotelId = hotel.hotel_id?.toString();
      const bookingUrl = hotel.url ||
        (hotelId ? `https://www.booking.com/hotel/${hotelId}.html` : null);

      return {
        id: hotelId || `hotel_${Math.random().toString(36)}`,
        name: hotel.hotel_name || hotel.name || 'Hotel Name Not Available',
        type: 'hotel',
        bookingUrl, // Add booking link
        location: {
          address: hotel.address || hotel.hotel_name || 'Address not available',
          city: hotel.city || destination,
          country: hotel.country_code || '',
          distance: hotel.distance_to_cc ?
            `${hotel.distance_to_cc} km from center` :
            (hotel.distance ? `${hotel.distance} from center` : 'Distance not available'),
          coordinates: hotel.latitude && hotel.longitude ? {
            lat: parseFloat(hotel.latitude),
            lng: parseFloat(hotel.longitude)
          } : null
        },
        price: parseFloat(price) || 0,
        currency: normalizedCurrency,
        requestedCurrency: requestedCurrency, // Track what was requested
        rating: parseFloat(rating) || 0,
        amenities: this.extractAmenities(hotel),
        description: hotel.hotel_name_trans || hotel.hotel_name || 'No description available',
        images: hotel.main_photo_url ? [hotel.main_photo_url] : [],
        availability: hotel.is_free_cancellable ? 'Free cancellation available' : 'Standard booking terms',
        rawData: hotel // Keep original data for debugging
      };
    });
  }

  extractAmenities(hotel) {
    const amenities = [];
    
    // Map known boolean properties to amenity names
    if (hotel.has_free_wifi || hotel.free_wifi) amenities.push('wifi');
    if (hotel.has_swimming_pool) amenities.push('pool');
    if (hotel.has_fitness_center) amenities.push('gym');
    if (hotel.has_parking) amenities.push('parking');
    if (hotel.has_restaurant) amenities.push('restaurant');
    if (hotel.has_bar) amenities.push('bar');
    if (hotel.has_spa) amenities.push('spa');
    if (hotel.has_room_service) amenities.push('room-service');
    if (hotel.is_free_cancellable) amenities.push('free-cancellation');
    if (hotel.has_business_center) amenities.push('business-center');
    if (hotel.has_air_conditioning) amenities.push('air-conditioning');
    
    // Add common default amenities
    if (!amenities.includes('wifi')) amenities.push('wifi');
    amenities.push('24h-front-desk');
    
    return [...new Set(amenities)]; // Remove duplicates
  }
}

export default new RapidApiHotelService();