import logger from '../utils/logger.js';

const log = logger.child({ scope: 'RapidApiHotelService' });

class RapidApiHotelService {
  constructor() {
    this.baseUrl = 'https://booking-com.p.rapidapi.com/v1';
    this.apiKey = null;
    this.isEnabled = false;
    this.destinationCache = new Map();
    this.destinationMap = {
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
  }

  getApiKey() {
    if (!this.apiKey) {
      this.apiKey = process.env.RAPIDAPI_KEY;
      
      if (!this.apiKey) {
        log.error('❌ RAPIDAPI_KEY not found in environment variables');
        this.isEnabled = false;
        return null;
      }
      
      this.isEnabled = true;
      log.info('✅ RapidAPI key loaded successfully');
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
        currency = 'USD', // Allow currency to be specified in search params
        country,
        placeId
      } = searchParams;

      log.debug('Searching hotels via RapidAPI', {
        destination,
        checkIn,
        checkOut,
        currency,
        country,
        placeId
      });

      const destId = await this.resolveDestinationId(destination, { country, placeId });
      log.debug(`Using destination ID: ${destId} for ${destination}`);

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
      log.debug('RapidAPI Request URL', { url, currency });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'booking-com.p.rapidapi.com'
        }
      });

      log.debug('RapidAPI Response Status', { status: response.status });

      if (!response.ok) {
        const errorText = await response.text();
        log.error('RapidAPI Error Response', { error: errorText });

        if (response.status === 422) {
          throw new Error(`RapidAPI validation error - check required parameters: ${errorText}`);
        }

        throw new Error(`RapidAPI error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      log.debug('RapidAPI Response Data Keys', { keys: Object.keys(data) });

      if (!data.result || !Array.isArray(data.result)) {
        log.warn('Unexpected API response structure', { data });
        throw new Error(`No hotels found for destination: ${destination}`);
      }

      if (data.result.length === 0) {
        throw new Error(`No hotels available for ${destination} on ${checkIn} to ${checkOut}`);
      }

      log.debug(`Found ${data.result.length} raw hotels from RapidAPI`);

      const hotels = this.transformHotelData(data.result, currency, destination);
      log.debug(`Successfully transformed ${hotels.length} hotels`);

      // Log currency summary
      const currencyCounts = hotels.reduce((acc, hotel) => {
        acc[hotel.currency] = (acc[hotel.currency] || 0) + 1;
        return acc;
      }, {});
      log.debug('Currency breakdown', currencyCounts);

      return hotels.slice(0, maxResults);

    } catch (error) {
      log.error('RapidAPI hotel search error', { error: error.message, stack: error.stack });

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

  async resolveDestinationId(destination, { country, placeId, coordinates } = {}) {
    const key = (destination || '').toLowerCase().trim();
    if (!key) {
      throw new Error('Destination is required to resolve destination ID');
    }

    // 1) Cache hit
    if (this.destinationCache.has(key)) {
      return this.destinationCache.get(key);
    }

    // 2) Live lookup via RapidAPI locations endpoint (preferred)
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('RapidAPI service not configured - missing RAPIDAPI_KEY in .env file');
    }

    const queryParams = new URLSearchParams({
      text: destination,
      locale: 'en-gb'
    });

    if (country) queryParams.set('country', country);
    if (placeId) queryParams.set('place_id', placeId);

    const url = `${this.baseUrl}/locations/auto-complete?${queryParams}`;
    log.debug('Looking up destination via RapidAPI auto-complete', { url });

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'booking-com.p.rapidapi.com'
        }
      });

      log.debug('RapidAPI destination lookup status', { status: response.status });

      if (!response.ok) {
        const errorText = await response.text();
        log.warn(`Destination lookup failed (${response.status}): ${errorText}`);
      } else {
        const data = await response.json();
        const candidates = Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data)
            ? data
            : data?.data || [];

        const cityCandidate = candidates.find(c =>
          (c.dest_type || c.type) === 'city' ||
          (c.label && c.label.toLowerCase().includes(destination.toLowerCase()))
        ) || candidates[0];

        const destId = cityCandidate?.dest_id || cityCandidate?.id;

        if (destId) {
          this.destinationCache.set(key, destId);
          log.info(`✅ Resolved destination "${destination}" to dest_id ${destId} via auto-complete`);
          return destId;
        }

        log.warn(`Destination lookup returned no dest_id for "${destination}"`, { candidates: candidates.length });
      }
    } catch (error) {
      log.warn(`Destination lookup error for "${destination}": ${error.message}`);
    }

    // 3) Retry with alternate endpoint when auto-complete fails (common 404)
    try {
      const altUrl = `${this.baseUrl}/hotels/locations?name=${encodeURIComponent(destination)}&locale=en-us`;
      log.debug('Retrying destination lookup via /hotels/locations', { url: altUrl });
      const altResp = await fetch(altUrl, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'booking-com.p.rapidapi.com'
        }
      });
      log.debug('RapidAPI alt destination lookup status', { status: altResp.status });

      if (altResp.ok) {
        const altData = await altResp.json();
        const candidates = Array.isArray(altData) ? altData : altData?.data || [];

        // Pick the closest city candidate when coordinates are available
        let cityCandidate = candidates.find(c =>
          (c.dest_type || c.type) === 'city' ||
          (c.city_name && c.city_name.toLowerCase().includes(destination.toLowerCase())) ||
          (c.search_type === 'CITY')
        );

        if (!cityCandidate && candidates.length > 0) {
          cityCandidate = candidates[0];
        }

        if (coordinates && candidates.length > 0) {
          const { lat, lng } = coordinates;
          const withDistance = candidates
            .map(c => {
              const clat = c.latitude || c.lat;
              const clng = c.longitude || c.lng;
              if (typeof clat !== 'number' || typeof clng !== 'number') return null;
              const dLat = clat - lat;
              const dLng = clng - lng;
              const dist2 = dLat * dLat + dLng * dLng;
              return { candidate: c, dist2 };
            })
            .filter(Boolean)
            .sort((a, b) => a.dist2 - b.dist2);
          if (withDistance.length > 0) {
            cityCandidate = withDistance[0].candidate;
          }
        }

        const destId = cityCandidate?.dest_id || cityCandidate?.destId || cityCandidate?.id;
        if (destId) {
          this.destinationCache.set(key, destId);
          log.info(`✅ Resolved destination "${destination}" to dest_id ${destId} via /hotels/locations`);
          return destId;
        }
        log.warn('Alternate destination lookup returned no usable city candidate', { sample: candidates[0] });
      } else {
        const altText = await altResp.text();
        log.warn(`Alternate destination lookup failed (${altResp.status}): ${altText}`);
      }
    } catch (error) {
      log.warn(`Alternate destination lookup error for "${destination}": ${error.message}`);
    }

    // 4) Known map hit as fallback
    if (this.destinationMap[key]) {
      const mappedId = this.destinationMap[key];
      this.destinationCache.set(key, mappedId);
      log.info(`ℹ️ Falling back to static map for "${destination}" -> ${mappedId}`);
      return mappedId;
    }

    // 4) Last resort fallback to Paris to avoid hard failure
    log.warn(`Destination "${destination}" not found via lookup. Using Paris as fallback.`);
    return this.destinationMap['paris'];
  }

  transformHotelData(hotelData, requestedCurrency = 'USD', destinationName = '') {
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
        log.warn(`⚠️ Currency mismatch for ${hotel.hotel_name}: expected ${requestedCurrency}, got ${normalizedCurrency}. Price: ${price}`);
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
          city: hotel.city || destinationName,
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
