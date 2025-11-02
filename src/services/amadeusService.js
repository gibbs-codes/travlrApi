// src/services/amadeusService.js
import Amadeus from 'amadeus';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

const log = logger.child({ scope: 'AmadeusService' });

class AmadeusService {
  constructor() {
    this.amadeus = null;
    this.isEnabled = null; // null means not initialized yet
    this.initializePromise = null;
    this.airportCodeCache = new Map(); // In-memory cache for airport lookups
    this.rateLimitRetryAfter = null; // Track when rate limit will reset
  }

  async initialize() {
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = this._doInitialize();
    return this.initializePromise;
  }

  async _doInitialize() {
    // Debug: Log environment loading
    log.debug('🔧 Initializing Amadeus service...');
    log.debug('Environment variables loaded:', {
      hasClientId: !!process.env.AMADEUS_CLIENT_ID,
      hasClientSecret: !!process.env.AMADEUS_CLIENT_SECRET,
      environment: process.env.AMADEUS_ENVIRONMENT || 'test'
    });
    
    // Validate environment variables
    const clientId = process.env.AMADEUS_CLIENT_ID;
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      log.error('❌ Missing Amadeus credentials!');
      log.error('AMADEUS_CLIENT_ID:', clientId ? 'Present' : 'Missing');
      log.error('AMADEUS_CLIENT_SECRET:', clientSecret ? 'Present' : 'Missing');
      log.error('Please add AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET to your .env file');
      log.error('Get them from: https://developers.amadeus.com/my-apps');
      
      // Don't throw error immediately - let the service be created but mark as disabled
      this.isEnabled = false;
      this.amadeus = null;
      return;
    }

    try {
      this.amadeus = new Amadeus({
        clientId: clientId,
        clientSecret: clientSecret,
        hostname: process.env.AMADEUS_ENVIRONMENT === 'production' ? 'production' : 'test'
      });
      this.isEnabled = true;
      log.debug('✅ Amadeus service initialized successfully');
    } catch (error) {
      log.error('❌ Failed to initialize Amadeus:', error.message);
      this.isEnabled = false;
      this.amadeus = null;
    }
  }

  async ensureInitialized() {
    if (this.isEnabled === null) {
      await this.initialize();
    }
  }

  async getCityAirportCode(cityName) {
    // If it's already a 3-letter code, return it as-is
    if (/^[A-Z]{3}$/i.test(cityName)) {
      return cityName.toUpperCase();
    }

    const normalizedCity = cityName.toLowerCase().trim();

    // Check cache first
    if (this.airportCodeCache.has(normalizedCity)) {
      log.debug(`✓ Cache hit for ${cityName}: ${this.airportCodeCache.get(normalizedCity)}`);
      return this.airportCodeCache.get(normalizedCity);
    }

    // Expanded fallback mapping for common cities - USE THIS FIRST to avoid rate limits
    const cityToAirportMap = {
      // US Cities
      'new york': 'JFK',
      'nyc': 'JFK',
      'chicago': 'ORD',
      'los angeles': 'LAX',
      'la': 'LAX',
      'san francisco': 'SFO',
      'miami': 'MIA',
      'boston': 'BOS',
      'seattle': 'SEA',
      'denver': 'DEN',
      'atlanta': 'ATL',
      'dallas': 'DFW',
      'houston': 'IAH',
      'philadelphia': 'PHL',
      'phoenix': 'PHX',
      'las vegas': 'LAS',
      'orlando': 'MCO',
      'washington': 'DCA',
      'washington dc': 'DCA',
      'detroit': 'DTW',
      'minneapolis': 'MSP',
      'portland': 'PDX',
      'austin': 'AUS',
      'nashville': 'BNA',
      'charlotte': 'CLT',
      'san diego': 'SAN',
      'tampa': 'TPA',
      'salt lake city': 'SLC',
      'san antonio': 'SAT',
      'sacramento': 'SMF',
      'pittsburgh': 'PIT',
      'cincinnati': 'CVG',
      'kansas city': 'MCI',
      'columbus': 'CMH',
      'indianapolis': 'IND',
      'cleveland': 'CLE',
      'san jose': 'SJC',
      'raleigh': 'RDU',
      'memphis': 'MEM',
      'louisville': 'SDF',
      'milwaukee': 'MKE',
      'albuquerque': 'ABQ',
      'tucson': 'TUS',
      'honolulu': 'HNL',
      'anchorage': 'ANC',

      // International Cities
      'london': 'LHR',
      'paris': 'CDG',
      'tokyo': 'NRT',
      'beijing': 'PEK',
      'shanghai': 'PVG',
      'hong kong': 'HKG',
      'singapore': 'SIN',
      'dubai': 'DXB',
      'sydney': 'SYD',
      'melbourne': 'MEL',
      'toronto': 'YYZ',
      'vancouver': 'YVR',
      'montreal': 'YUL',
      'mexico city': 'MEX',
      'frankfurt': 'FRA',
      'amsterdam': 'AMS',
      'madrid': 'MAD',
      'barcelona': 'BCN',
      'rome': 'FCO',
      'milan': 'MXP',
      'zurich': 'ZRH',
      'vienna': 'VIE',
      'brussels': 'BRU',
      'munich': 'MUC',
      'istanbul': 'IST',
      'athens': 'ATH',
      'lisbon': 'LIS',
      'dublin': 'DUB',
      'copenhagen': 'CPH',
      'stockholm': 'ARN',
      'oslo': 'OSL',
      'helsinki': 'HEL',
      'warsaw': 'WAW',
      'prague': 'PRG',
      'budapest': 'BUD',
      'moscow': 'SVO',
      'delhi': 'DEL',
      'mumbai': 'BOM',
      'bangalore': 'BLR',
      'seoul': 'ICN',
      'bangkok': 'BKK',
      'kuala lumpur': 'KUL',
      'jakarta': 'CGK',
      'manila': 'MNL',
      'taipei': 'TPE',
      'ho chi minh': 'SGN',
      'hanoi': 'HAN',
      'sao paulo': 'GRU',
      'rio de janeiro': 'GIG',
      'buenos aires': 'EZE',
      'santiago': 'SCL',
      'bogota': 'BOG',
      'lima': 'LIM',
      'johannesburg': 'JNB',
      'cape town': 'CPT',
      'cairo': 'CAI',
      'casablanca': 'CMN',
      'tel aviv': 'TLV',
      'riyadh': 'RUH',
      'doha': 'DOH',
      'abu dhabi': 'AUH',
      'auckland': 'AKL'
    };

    // Check fallback map FIRST to avoid unnecessary API calls
    const airportCode = cityToAirportMap[normalizedCity];
    if (airportCode) {
      log.debug(`✓ Fallback map hit for ${cityName}: ${airportCode}`);
      this.airportCodeCache.set(normalizedCity, airportCode);
      return airportCode;
    }

    // Only call API if not in fallback map and not rate-limited
    if (this.isRateLimited()) {
      log.warn(`⚠️ Rate limited, using city name as-is: ${cityName}`);
      return cityName;
    }

    try {
      // Try to get airport info from Amadeus API
      const airports = await this.getAirportInfo(cityName);

      if (airports && airports.length > 0) {
        const code = airports[0].iataCode;
        log.debug(`✓ API lookup for ${cityName}: ${code}`);
        this.airportCodeCache.set(normalizedCity, code);
        return code;
      }
    } catch (error) {
      // Handle rate limit errors
      if (error.response?.result?.errors?.[0]?.code === 38194 || error.response?.status === 429) {
        log.warn(`⚠️ Rate limit hit for airport lookup: ${cityName}`);
        this.setRateLimitTimeout();
      } else {
        log.warn(`Failed to lookup airport for ${cityName}:`, error.message);
      }
    }

    // If no mapping found, return original and let Amadeus flight search API return proper error
    log.warn(`⚠️ No airport code found for ${cityName}, using as-is`);
    return cityName;
  }

  isRateLimited() {
    if (!this.rateLimitRetryAfter) return false;
    const now = Date.now();
    if (now < this.rateLimitRetryAfter) {
      return true;
    }
    // Reset if timeout has passed
    this.rateLimitRetryAfter = null;
    return false;
  }

  setRateLimitTimeout(seconds = 60) {
    // Set a timeout before retrying API calls
    this.rateLimitRetryAfter = Date.now() + (seconds * 1000);
    log.debug(`⏱️ Rate limit timeout set for ${seconds} seconds`);
  }

  async searchFlights(searchParams, retryCount = 0) {
    await this.ensureInitialized();

    if (!this.isEnabled) {
      throw new Error('Amadeus service is not properly configured. Check your API credentials.');
    }

    try {
      const {
        origin,
        destination,
        departureDate,
        returnDate,
        adults = 1,
        maxResults = 10,
        currency = 'USD' // Allow currency preference
      } = searchParams;

      // Convert city names to airport codes
      const originCode = await this.getCityAirportCode(origin);
      const destinationCode = await this.getCityAirportCode(destination);

      log.debug(`Converted: ${origin} → ${originCode}, ${destination} → ${destinationCode}`);
      log.debug('Searching flights:', { origin: originCode, destination: destinationCode, departureDate, currency });
      log.debug(`💱 Requesting flight prices in: ${currency}`);

      const response = await this.amadeus.shopping.flightOffersSearch.get({
        originLocationCode: originCode,
        destinationLocationCode: destinationCode,
        departureDate: departureDate,
        returnDate: returnDate,
        adults: adults,
        max: maxResults,
        currencyCode: currency // Amadeus API parameter for currency
      });

      return this.transformFlightData(response.data, currency);
    } catch (error) {
      log.error('Amadeus flight search error:', error);

      // Handle rate limiting with exponential backoff
      const isRateLimitError = error.response?.result?.errors?.[0]?.code === 38194 || error.response?.status === 429;

      if (isRateLimitError && retryCount < 3) {
        const backoffSeconds = Math.pow(2, retryCount) * 10; // 10s, 20s, 40s
        log.warn(`⚠️ Rate limit hit (attempt ${retryCount + 1}/3). Retrying in ${backoffSeconds}s...`);

        this.setRateLimitTimeout(backoffSeconds);

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, backoffSeconds * 1000));

        // Retry with incremented count
        return this.searchFlights(searchParams, retryCount + 1);
      }

      // More helpful error messages
      if (error.code === 'NetworkError') {
        throw new Error('Unable to connect to Amadeus API. Check your internet connection.');
      }
      if (error.response?.status === 401) {
        throw new Error('Amadeus authentication failed. Check your API credentials.');
      }
      if (error.response?.status === 400) {
        throw new Error(`Invalid flight search parameters: ${error.response.data?.error_description || error.message}`);
      }
      if (isRateLimitError) {
        throw new Error('Amadeus API rate limit exceeded. Please try again later.');
      }

      throw new Error(`Flight search failed: ${error.message}`);
    }
  }

  transformFlightData(amadeusData, requestedCurrency = 'USD') {
    const flights = amadeusData.map(offer => {
      const outbound = offer.itineraries[0];
      const firstSegment = outbound.segments[0];
      const lastSegment = outbound.segments[outbound.segments.length - 1];

      const price = parseFloat(offer.price.total);
      const returnedCurrency = (offer.price.currency || 'USD').toUpperCase();

      // Warn if currency doesn't match requested
      if (returnedCurrency !== requestedCurrency) {
        log.warn(`⚠️ Currency mismatch for flight ${offer.id}: expected ${requestedCurrency}, got ${returnedCurrency}. Price: ${price}`);
      }

      return {
        id: offer.id,
        airline: firstSegment.carrierCode,
        flightNumber: firstSegment.number,
        departure: {
          airport: firstSegment.departure.iataCode,
          time: new Date(firstSegment.departure.at).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          date: new Date(firstSegment.departure.at).toISOString().split('T')[0]
        },
        arrival: {
          airport: lastSegment.arrival.iataCode,
          time: new Date(lastSegment.arrival.at).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          date: new Date(lastSegment.arrival.at).toISOString().split('T')[0]
        },
        price,
        currency: returnedCurrency,
        requestedCurrency, // Track what was requested
        duration: outbound.duration,
        stops: outbound.segments.length - 1,
        class: offer.travelerPricings[0].fareDetailsBySegment[0].cabin,
        segments: outbound.segments.length,
        rawData: offer // Keep for debugging
      };
    });

    // Log currency summary
    const currencyCounts = flights.reduce((acc, flight) => {
      acc[flight.currency] = (acc[flight.currency] || 0) + 1;
      return acc;
    }, {});
    log.debug(`💱 Flight currency breakdown:`, currencyCounts);

    return flights;
  }

  async getAirportInfo(query) {
    await this.ensureInitialized();
    
    if (!this.isEnabled) {
      throw new Error('Amadeus service is not properly configured. Check your API credentials.');
    }

    try {
      const response = await this.amadeus.referenceData.locations.get({
        keyword: query,
        subType: 'AIRPORT'
      });
      return response.data;
    } catch (error) {
      log.error('Airport search error:', error);
      throw error;
    }
  }
}

export default new AmadeusService();
