// src/services/amadeusService.js
import Amadeus from 'amadeus';

class AmadeusService {
  constructor() {
    this.amadeus = null;
    this.isEnabled = null; // null means not initialized yet
    this.initializePromise = null;
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
    console.log('🔧 Initializing Amadeus service...');
    console.log('Environment variables loaded:', {
      hasClientId: !!process.env.AMADEUS_CLIENT_ID,
      hasClientSecret: !!process.env.AMADEUS_CLIENT_SECRET,
      environment: process.env.AMADEUS_ENVIRONMENT || 'test'
    });
    
    // Validate environment variables
    const clientId = process.env.AMADEUS_CLIENT_ID;
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      console.error('❌ Missing Amadeus credentials!');
      console.error('AMADEUS_CLIENT_ID:', clientId ? 'Present' : 'Missing');
      console.error('AMADEUS_CLIENT_SECRET:', clientSecret ? 'Present' : 'Missing');
      console.error('Please add AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET to your .env file');
      console.error('Get them from: https://developers.amadeus.com/my-apps');
      
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
      console.log('✅ Amadeus service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Amadeus:', error.message);
      this.isEnabled = false;
      this.amadeus = null;
    }
  }

  async ensureInitialized() {
    if (this.isEnabled === null) {
      await this.initialize();
    }
  }

  async searchFlights(searchParams) {
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
        maxResults = 10
      } = searchParams;

      console.log('Searching flights:', { origin, destination, departureDate });

      const response = await this.amadeus.shopping.flightOffersSearch.get({
        originLocationCode: origin,
        destinationLocationCode: destination,
        departureDate: departureDate,
        returnDate: returnDate,
        adults: adults,
        max: maxResults
      });

      return this.transformFlightData(response.data);
    } catch (error) {
      console.error('Amadeus flight search error:', error);
      
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
      
      throw new Error(`Flight search failed: ${error.message}`);
    }
  }

  transformFlightData(amadeusData) {
    return amadeusData.map(offer => {
      const outbound = offer.itineraries[0];
      const firstSegment = outbound.segments[0];
      const lastSegment = outbound.segments[outbound.segments.length - 1];

      return {
        id: offer.id,
        airline: firstSegment.carrierCode,
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
        price: parseFloat(offer.price.total),
        currency: offer.price.currency,
        duration: outbound.duration,
        stops: outbound.segments.length - 1,
        class: offer.travelerPricings[0].fareDetailsBySegment[0].cabin,
        segments: outbound.segments.length,
        rawData: offer // Keep for debugging
      };
    });
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
      console.error('Airport search error:', error);
      throw error;
    }
  }
}

export default new AmadeusService();