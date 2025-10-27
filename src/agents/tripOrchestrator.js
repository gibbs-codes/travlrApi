import { BaseAgent } from './baseAgent.js';
import { FlightAgent } from './flightAgent.js';
import { AccommodationAgent } from './accommodationAgent.js';
import { ActivityAgent } from './activityAgent.js';
import { RestaurantAgent } from './restaurantAgent.js';
import { Trip, Recommendation } from '../models/index.js';
import databaseService from '../services/database.js';
import geographicService from '../services/geographicService.js';

export class TripOrchestrator extends BaseAgent {
  constructor(aiConfig = {}, tripId = null) {
    super(
      'TripOrchestrator',
      ['trip_planning', 'agent_coordination', 'result_synthesis', 'database_integration'],
      aiConfig
    );

    this.tripId = tripId;
    this.trip = null;
    this.executionContext = {
      hotelLocation: null,
      selectedActivities: [],
      budgetTracking: {
        allocated: {},
        spent: {},
        remaining: {}
      },
      geographicClusters: []
    };

    // Initialize specialized agents
    this.agents = {
      flight: new FlightAgent(aiConfig),
      accommodation: new AccommodationAgent(aiConfig),
      activity: new ActivityAgent(aiConfig),
      restaurant: new RestaurantAgent(aiConfig)
    };

    // Define execution phases with dependencies
    // IMPORTANT: Sequential execution ensures proper geographic planning
    this.executionPhases = [
      {
        phase: 'accommodation_first',
        agents: ['accommodation'],
        parallel: false,
        description: 'Find hotel first - establishes geographic anchor'
      },
      {
        phase: 'flights',
        agents: ['flight'],
        parallel: false,
        dependencies: ['accommodation'],
        description: 'Book flights after hotel location is known'
      },
      {
        phase: 'experiences',
        agents: ['activity', 'restaurant'],
        parallel: false,
        dependencies: ['accommodation', 'flight'],
        description: 'Plan activities and dining based on hotel location'
      }
    ];

    this.tripSchema = {
      tripSummary: {
        destination: '',
        dates: { departure: '', return: '' },
        budget: { total: 0, breakdown: {} },
        confidence: 0,
        geographicCoverage: 0
      },
      recommendations: {
        flight: [],
        accommodation: [],
        activity: [],
        restaurant: []
      },
      itinerary: [],
      alternatives: [],
      metadata: {
        searchCriteria: {},
        executionTime: '',
        agentResults: {},
        budgetValidation: {},
        geographicAnalysis: {}
      }
    };
  }

  async execute(tripRequest, tripId = null) {
    const startTime = Date.now();

    try {
      this.activate();

      // Set tripId and load trip if provided
      if (tripId) {
        this.tripId = tripId;
        await this.loadTripFromDatabase();
      }

      console.log(`Starting enhanced trip planning for: ${tripRequest.destination}`);
      await this.updateTripStatus('in_progress', { startedAt: new Date() });

      // Extract and validate trip criteria with budget tracking
      const criteria = this.extractCriteria(tripRequest);
      this.initializeBudgetTracking(criteria);

      // Determine which agents to run
      const agentsToRun = tripRequest.agentsToRun;
      let agentResults;

      if (agentsToRun && Array.isArray(agentsToRun)) {
        // Use selective agent execution
        console.log(`🎯 Selective execution mode: ${agentsToRun.join(', ')}`);
        agentResults = await this.executeSelectedAgents(agentsToRun, criteria);
      } else {
        // Execute all agents (backward compatibility)
        console.log(`🎯 Full execution mode: all agents`);
        agentResults = await this.executeAgentsWithDependencies(criteria, ['flight', 'accommodation', 'activity', 'restaurant']);
      }
      
      console.log('Enhanced agent execution completed:', {
        totalAgents: agentResults.length,
        successful: agentResults.filter(r => r.success).length,
        failed: agentResults.filter(r => !r.success).length
      });

      // Synthesize results with geographic clustering
      const tripPlan = await this.synthesizeEnhancedTripPlan(agentResults, criteria);

      // Generate final recommendations with enhanced business logic
      const finalPlan = await this.generateEnhancedRecommendations(tripPlan, criteria);

      const executionTime = Date.now() - startTime;

      // Determine final trip status based on agent results
      const finalStatus = await this.determineFinalTripStatus(agentResults);

      // Update trip status with proper status field
      await this.updateTripStatus('completed', {
        completedAt: new Date(),
        totalDuration: executionTime
      });

      // Update the top-level trip status (recommendations_ready or failed)
      await this.updateTopLevelTripStatus(finalStatus);
      
      return {
        success: true,
        data: {
          ...finalPlan,
          metadata: {
            ...finalPlan.metadata,
            executionTime: `${executionTime}ms`,
            agentResults,
            budgetAnalysis: this.executionContext.budgetTracking,
            geographicAnalysis: this.executionContext.geographicClusters
          }
        },
        executedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Trip orchestrator execution failed:', error);

      // Update trip with error status
      await this.updateTripStatus('failed', {
        error: error.message,
        completedAt: new Date()
      });

      // Update top-level trip status to failed
      await this.updateTopLevelTripStatus('failed');

      return {
        success: false,
        error: error.message,
        executedAt: new Date().toISOString(),
        partialResults: this.executionContext
      };
    } finally {
      this.deactivate();
    }
  }

  // Database Integration Methods
  async loadTripFromDatabase() {
    if (!this.tripId) return;
    
    try {
      await databaseService.connect();
      this.trip = await Trip.findById(this.tripId);
      
      if (this.trip) {
        console.log(`Loaded trip ${this.trip.tripId} from database`);
      }
    } catch (error) {
      console.error('Failed to load trip from database:', error);
    }
  }

  async ensureTripLoaded() {
    if (!this.trip && this.tripId) {
      await this.loadTripFromDatabase();
    }
  }

  async updateTripStatus(status, metadata = {}) {
    if (!this.tripId) return;
    
    try {
      const updateData = {
        'agentExecution.status': status,
        ...Object.entries(metadata).reduce((acc, [key, value]) => {
          acc[`agentExecution.${key}`] = value;
          return acc;
        }, {})
      };
      
      await Trip.findByIdAndUpdate(this.tripId, updateData);
      console.log(`Updated trip ${this.tripId} status to: ${status}`);
    } catch (error) {
      console.error('Failed to update trip status:', error);
    }
  }

  async updateAgentStatus(agentName, status, metadata = {}) {
    if (!this.tripId) return;

    try {
      const updateData = {
        [`agentExecution.agents.${agentName}.status`]: status,
        ...Object.entries(metadata).reduce((acc, [key, value]) => {
          acc[`agentExecution.agents.${agentName}.${key}`] = value;
          return acc;
        }, {})
      };

      await Trip.findByIdAndUpdate(this.tripId, updateData);
    } catch (error) {
      console.error(`Failed to update ${agentName} agent status:`, error);
    }
  }

  /**
   * Determine final trip status based on agent execution results
   * - If ALL agents completed successfully (even with 0 recommendations), return 'recommendations_ready'
   * - If ANY agent failed, return 'failed'
   */
  async determineFinalTripStatus(agentResults) {
    // FORCE fresh reload from database to get latest agent statuses
    await this.loadTripFromDatabase();

    if (!this.trip) {
      console.warn('Cannot determine trip status - trip not loaded');
      return 'failed';
    }

    // Check each agent's final status in the database
    const agentNames = ['flight', 'accommodation', 'activity', 'restaurant'];
    const agentStatuses = agentNames.map(name => {
      const agentStatus = this.trip.agentExecution?.agents?.[name]?.status;
      return {
        name,
        status: agentStatus
      };
    });

    console.log('📊 Final agent statuses:', agentStatuses);

    // Check if any agent failed
    const hasFailedAgent = agentStatuses.some(agent => agent.status === 'failed');

    // Check if all agents completed
    const allCompleted = agentStatuses.every(agent =>
      agent.status === 'completed' || agent.status === 'skipped'
    );

    if (hasFailedAgent) {
      console.warn('⚠️ One or more agents failed - marking trip as failed');
      return 'failed';
    }

    if (allCompleted) {
      console.log('✅ All agents completed successfully - marking trip as recommendations_ready');
      return 'recommendations_ready';
    }

    // Default to failed if status is unclear
    console.warn('⚠️ Agent execution status unclear - marking trip as failed');
    return 'failed';
  }

  /**
   * Update the top-level trip status field
   */
  async updateTopLevelTripStatus(status) {
    if (!this.tripId) return;

    try {
      await Trip.findByIdAndUpdate(this.tripId, { status });
      console.log(`✅ Updated trip status to: ${status}`);
    } catch (error) {
      console.error('Failed to update top-level trip status:', error);
    }
  }

  async storeRecommendations(agentName, recommendations) {
    if (!this.tripId || !Array.isArray(recommendations)) {
      return { ids: [], errors: [] };
    }

    await this.ensureTripLoaded();

    const errorEntries = [];
    const normalizedEntries = [];

    recommendations.forEach((rawRecommendation, index) => {
      try {
        const normalized = this.normalizeRecommendation(agentName, rawRecommendation);
        normalizedEntries.push({ index, raw: rawRecommendation, normalized });
      } catch (error) {
        const message = this.extractRecommendationError(error);
        errorEntries.push({
          message,
          timestamp: new Date(),
          stack: error?.stack
        });

        console.error(`❌ Failed to normalize ${agentName} recommendation "${rawRecommendation?.name || rawRecommendation?.title || 'Unknown'}":`, message);
      }
    });

    let insertedDocs = [];

    if (normalizedEntries.length > 0) {
      try {
        insertedDocs = await Recommendation.insertMany(
          normalizedEntries.map((entry) => entry.normalized),
          {
            ordered: false,
            rawResult: false
          }
        );
      } catch (error) {
        if (Array.isArray(error.insertedDocs)) {
          insertedDocs = error.insertedDocs;
        }

        if (Array.isArray(error.writeErrors)) {
          for (const writeError of error.writeErrors) {
            const failedEntry = normalizedEntries[writeError.index];
            errorEntries.push({
              message: writeError.errmsg || writeError.message,
              timestamp: new Date(),
              stack: writeError.err?.stack
            });

            console.error(`❌ Failed to insert ${agentName} recommendation "${failedEntry?.raw?.name || 'Unknown'}":`, writeError.errmsg || writeError.message);
          }
        } else if (error.errors) {
          Object.values(error.errors).forEach((err) => {
            errorEntries.push({
              message: err.message,
              timestamp: new Date(),
              stack: err.stack
            });
          });
        } else {
          errorEntries.push({
            message: error.message,
            timestamp: new Date(),
            stack: error.stack
          });
        }
      }
    }

    const recommendationIds = insertedDocs
      .map((doc) => doc && doc._id)
      .filter(Boolean);

    const updateOps = {
      $set: {
        [`agentExecution.agents.${agentName}.recommendationCount`]: recommendationIds.length
      }
    };

    if (recommendationIds.length > 0) {
      updateOps.$push = updateOps.$push || {};
      updateOps.$push[`recommendations.${agentName}`] = { $each: recommendationIds };
    }

    if (errorEntries.length > 0) {
      updateOps.$push = updateOps.$push || {};
      updateOps.$push[`agentExecution.agents.${agentName}.errors`] = { $each: errorEntries };
    }

    try {
      await Trip.findByIdAndUpdate(this.tripId, updateOps);
    } catch (error) {
      console.error(`Failed to update trip with ${agentName} recommendations:`, error);
    }

    if (this.trip && recommendationIds.length > 0) {
      this.trip.recommendations = this.trip.recommendations || {};
      this.trip.recommendations[agentName] = this.trip.recommendations[agentName] || [];
      this.trip.recommendations[agentName].push(...recommendationIds);
    }

    return { ids: recommendationIds, errors: errorEntries };
  }

  normalizeRecommendation(agentName, rawRecommendation = {}) {
    const normalizedPrice = this.normalizePrice(agentName, rawRecommendation);
    const normalizedRating = this.normalizeRating(rawRecommendation);
    const location = this.normalizeLocation(rawRecommendation);
    const confidence = this.normalizeConfidence(agentName, rawRecommendation);
    const agentMetadata = this.buildAgentMetadata(agentName, rawRecommendation);
    const externalIds = this.buildExternalIds(rawRecommendation);
    const images = this.normalizeImages(rawRecommendation);
    const name = this.buildRecommendationName(agentName, rawRecommendation, location);
    const description = this.buildRecommendationDescription(agentName, rawRecommendation, normalizedPrice, normalizedRating);

    // Debug logging for restaurants
    if (agentName === 'restaurant') {
      console.log(`🔍 Normalizing restaurant recommendation:`, {
        rawName: rawRecommendation.name,
        rawRating: rawRecommendation.rating?.score || rawRecommendation.rating,
        rawPrice: rawRecommendation.price?.amount || rawRecommendation.price,
        rawAddress: rawRecommendation.location?.address,
        normalizedName: name,
        normalizedRating: normalizedRating.score,
        normalizedPrice: normalizedPrice.amount,
        hasImages: images.length > 0,
        imageCount: images.length
      });
    }

    return {
      agentType: agentName,
      name,
      description,
      price: normalizedPrice,
      rating: normalizedRating,
      location,
      confidence,
      agentMetadata,
      externalIds,
      images
    };
  }

  normalizePrice(agentName, rawRecommendation) {
    const rawAmount = rawRecommendation?.price?.amount ?? rawRecommendation?.price ?? rawRecommendation?.cost ?? 0;
    const amount = Number(rawAmount);
    const safeAmount = Number.isFinite(amount) && amount >= 0 ? amount : 0;

    let currency = rawRecommendation?.price?.currency || rawRecommendation?.currency || this.trip?.preferences?.budget?.currency || 'USD';
    if (typeof currency === 'string') {
      currency = currency.trim().toUpperCase().slice(0, 3) || 'USD';
    } else {
      currency = 'USD';
    }

    // Log currency mismatch if not USD
    const requestedCurrency = rawRecommendation?.requestedCurrency || 'USD';
    if (currency !== requestedCurrency && safeAmount > 0) {
      console.warn(`⚠️ ${agentName} currency mismatch: expected ${requestedCurrency}, got ${currency} for ${rawRecommendation.name || 'item'} (${safeAmount} ${currency})`);
    }

    const rawPriceType = rawRecommendation?.price?.priceType;
    const allowedPriceTypes = ['per_person', 'per_night', 'per_room', 'per_group', 'total'];
    const priceType = allowedPriceTypes.includes(rawPriceType) ? rawPriceType : this.getPriceType(agentName);

    return {
      amount: safeAmount,
      currency,
      priceType,
      originalCurrency: rawRecommendation?.currency || rawRecommendation?.price?.currency, // Track original
      requestedCurrency // Track what was requested
    };
  }

  normalizeRating(rawRecommendation = {}) {
    let score = rawRecommendation?.rating?.score ?? rawRecommendation?.rating ?? rawRecommendation?.score ?? 0;

    if (typeof score === 'string') {
      const parsed = parseFloat(score);
      score = Number.isFinite(parsed) ? parsed : 0;
    }

    if (Number.isFinite(score)) {
      if (score > 5 && score <= 10) {
        score = score / 2;
      } else if (score > 10) {
        score = 5;
      }
    } else {
      score = 0;
    }

    score = Math.max(0, Math.min(5, score));

    const reviewCount = rawRecommendation?.rating?.reviewCount ?? rawRecommendation?.reviewCount ?? 0;
    const normalizedReviewCount = Number.isFinite(Number(reviewCount)) ? Number(reviewCount) : 0;

    const source = rawRecommendation?.rating?.source ||
      rawRecommendation?.source ||
      rawRecommendation?.airline ||
      rawRecommendation?.provider ||
      'agent';

    return {
      score,
      reviewCount: normalizedReviewCount,
      source
    };
  }

  normalizeLocation(rawRecommendation = {}) {
    const tripDestination = this.trip?.destination || {};
    const sourceLocation = rawRecommendation.location || {};
    const coordinates = this.normalizeCoordinates(
      sourceLocation.coordinates ||
      rawRecommendation.coordinates ||
      tripDestination.coordinates
    );

    const address = sourceLocation.address ||
      rawRecommendation.address ||
      (rawRecommendation.departure && rawRecommendation.arrival
        ? `${rawRecommendation.departure.airport || 'Origin'} → ${rawRecommendation.arrival.airport || 'Destination'}`
        : undefined);

    const city = sourceLocation.city || tripDestination.name || tripDestination.city;
    const country = sourceLocation.country || tripDestination.country;
    const placeId = sourceLocation.placeId || tripDestination.placeId;

    const location = {};
    if (address) location.address = address;
    if (city) location.city = city;
    if (country) location.country = country;
    if (coordinates) location.coordinates = coordinates;
    if (placeId) location.placeId = placeId;

    return location;
  }

  normalizeCoordinates(rawCoordinates) {
    if (!rawCoordinates) return undefined;

    const latitude = rawCoordinates.latitude ?? rawCoordinates.lat ?? (Array.isArray(rawCoordinates) ? rawCoordinates[0] : undefined);
    const longitude = rawCoordinates.longitude ?? rawCoordinates.lng ?? rawCoordinates.lon ?? (Array.isArray(rawCoordinates) ? rawCoordinates[1] : undefined);

    const latNumber = Number(latitude);
    const lonNumber = Number(longitude);

    if (!Number.isFinite(latNumber) || !Number.isFinite(lonNumber)) {
      return undefined;
    }

    return {
      latitude: latNumber,
      longitude: lonNumber
    };
  }

  normalizeConfidence(agentName, rawRecommendation = {}) {
    let score = rawRecommendation?.confidence?.score ?? rawRecommendation?.confidence;

    if (typeof score === 'number' && score > 1) {
      score = score / 100;
    }

    if (!Number.isFinite(score)) {
      score = this.calculateRecommendationConfidence(rawRecommendation);
    }

    score = Math.max(0, Math.min(1, score));

    const reasoning = rawRecommendation?.confidence?.reasoning ||
      rawRecommendation?.reasoning ||
      `Generated by ${agentName} agent`;

    return {
      score,
      reasoning
    };
  }

  buildAgentMetadata(agentName, rawRecommendation = {}) {
    switch (agentName) {
      case 'flight': {
        const metadata = {
          airline: rawRecommendation.airline || rawRecommendation.agentMetadata?.airline,
          flightNumber: rawRecommendation.flightNumber || rawRecommendation.agentMetadata?.flightNumber,
          departureAirport: rawRecommendation.departure?.airport,
          departureTime: rawRecommendation.departure?.time,
          departureDate: rawRecommendation.departure?.date,
          arrivalAirport: rawRecommendation.arrival?.airport,
          arrivalTime: rawRecommendation.arrival?.time,
          arrivalDate: rawRecommendation.arrival?.date,
          duration: rawRecommendation.duration || rawRecommendation.agentMetadata?.duration,
          stops: typeof rawRecommendation.stops === 'number' ? rawRecommendation.stops : rawRecommendation.agentMetadata?.stops,
          cabin: rawRecommendation.class || rawRecommendation.cabin || rawRecommendation.agentMetadata?.cabin
        };

        return Object.fromEntries(
          Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null)
        );
      }

      case 'accommodation': {
        const checkIn = rawRecommendation.checkIn || this.trip?.dates?.departureDate;
        const checkOut = rawRecommendation.checkOut || this.trip?.dates?.returnDate;

        return {
          hotelType: rawRecommendation.type || rawRecommendation.agentMetadata?.hotelType || 'hotel',
          amenities: Array.isArray(rawRecommendation.amenities)
            ? rawRecommendation.amenities
            : rawRecommendation.agentMetadata?.amenities || [],
          roomType: rawRecommendation.roomType || rawRecommendation.agentMetadata?.roomType || 'standard',
          checkIn,
          checkOut
        };
      }

      default:
        return rawRecommendation.agentMetadata || {};
    }
  }

  buildExternalIds(rawRecommendation = {}) {
    const externalIds = rawRecommendation.externalIds || {};

    const result = {
      bookingId: rawRecommendation.bookingId || externalIds.bookingId,
      googlePlaceId: rawRecommendation.googlePlaceId || externalIds.googlePlaceId,
      amadeusId: rawRecommendation.amadeusId || externalIds.amadeusId,
      providerId: rawRecommendation.id || rawRecommendation.providerId || externalIds.providerId
    };

    return Object.fromEntries(
      Object.entries(result).filter(([, value]) => value !== undefined && value !== null)
    );
  }

  normalizeImages(rawRecommendation = {}) {
    if (!Array.isArray(rawRecommendation.images)) {
      return [];
    }

    return rawRecommendation.images
      .map((image, index) => {
        if (typeof image === 'string') {
          return {
            url: image,
            alt: rawRecommendation.name
              ? `${rawRecommendation.name} image ${index + 1}`
              : `Recommendation image ${index + 1}`
          };
        }

        if (image && typeof image === 'object' && image.url) {
          return {
            url: image.url,
            alt: image.alt || rawRecommendation.name || undefined,
            isPrimary: image.isPrimary || index === 0
          };
        }

        return null;
      })
      .filter(Boolean);
  }

  buildRecommendationName(agentName, rawRecommendation = {}, location = {}) {
    switch (agentName) {
      case 'flight': {
        const airline = rawRecommendation.airline || 'Flight';
        const flightNumber = rawRecommendation.flightNumber || '';
        const departure = rawRecommendation.departure?.airport || location.address?.split('→')?.[0] || 'Origin';
        const arrival = rawRecommendation.arrival?.airport || location.address?.split('→')?.[1] || 'Destination';
        const name = `${airline.trim()} ${flightNumber}`.trim();
        return name || `${departure} → ${arrival}`;
      }
      case 'accommodation':
        return rawRecommendation.name || rawRecommendation.title || 'Accommodation Option';
      case 'restaurant':
        return rawRecommendation.name || rawRecommendation.title || 'Restaurant';
      case 'activity':
        return rawRecommendation.name || rawRecommendation.title || 'Activity';
      default:
        return rawRecommendation.name || rawRecommendation.title || `${agentName} recommendation`;
    }
  }

  buildRecommendationDescription(agentName, rawRecommendation = {}, price, rating) {
    switch (agentName) {
      case 'flight': {
        const departureAirport = rawRecommendation.departure?.airport || 'Origin';
        const arrivalAirport = rawRecommendation.arrival?.airport || 'Destination';
        const departureDate = rawRecommendation.departure?.date || 'selected date';
        const stops = typeof rawRecommendation.stops === 'number' ? rawRecommendation.stops : 0;
        const duration = rawRecommendation.duration || 'Unknown duration';
        return `Flight from ${departureAirport} to ${arrivalAirport} on ${departureDate}. ${stops} stop(s), duration ${duration}. Fare: ${price.currency} ${price.amount.toFixed(2)}.`;
      }
      case 'accommodation': {
        const ratingText = rating.score ? `${rating.score.toFixed(1)}/5` : 'Unrated';
        const amenities = Array.isArray(rawRecommendation.amenities) && rawRecommendation.amenities.length > 0
          ? rawRecommendation.amenities.slice(0, 3).join(', ')
          : 'Essential amenities';
        return `${rawRecommendation.name || 'Accommodation'} rated ${ratingText}. Key amenities: ${amenities}. Nightly rate: ${price.currency} ${price.amount.toFixed(2)}.`;
      }
      case 'restaurant': {
        const ratingText = rating.score ? `${rating.score.toFixed(1)}/5` : 'Unrated';
        const cuisine = rawRecommendation.agentMetadata?.cuisine || rawRecommendation.cuisine || 'restaurant';
        const address = rawRecommendation.location?.address || 'destination';
        const priceRange = rawRecommendation.agentMetadata?.priceRange || '';
        const priceInfo = price.amount > 0
          ? `Average meal: ${price.currency} ${price.amount.toFixed(2)} ${price.priceType || 'per person'}`
          : (priceRange ? `Price range: ${priceRange}` : '');
        return `${cuisine} restaurant${address ? ` at ${address}` : ''}. Rating: ${ratingText}.${priceInfo ? ` ${priceInfo}.` : ''}`;
      }
      case 'activity': {
        const ratingText = rating.score ? ` Rated ${rating.score.toFixed(1)}/5` : '';
        const duration = rawRecommendation.agentMetadata?.duration || rawRecommendation.duration;
        const durationText = duration ? `. Duration: ${duration}` : '';
        const priceText = price.amount > 0 ? ` Price: ${price.currency} ${price.amount.toFixed(2)} ${price.priceType || 'per person'}` : '';
        const description = rawRecommendation.description || rawRecommendation.summary || '';
        return `${description}${ratingText}${durationText}.${priceText ? `${priceText}.` : ''}`.trim();
      }
      default:
        return rawRecommendation.description ||
          rawRecommendation.summary ||
          `Generated by ${agentName} agent`;
    }
  }

  extractRecommendationError(error) {
    if (!error) return 'Unknown validation error';
    if (error.name === 'ValidationError' && error.errors) {
      return Object.values(error.errors)
        .map(err => err.message)
        .join('; ');
    }
    return error.message || 'Unknown validation error';
  }

  getPriceType(agentName) {
    const priceTypes = {
      flight: 'total',
      accommodation: 'per_night',
      activity: 'per_person',
      restaurant: 'per_person'
    };
    return priceTypes[agentName] || 'per_person';
  }

  calculateRecommendationConfidence(rec) {
    let confidence = 0.7; // Base confidence

    const ratingScore = typeof rec.rating === 'number'
      ? rec.rating
      : rec.rating?.score;

    if (ratingScore && ratingScore > 4.0) confidence += 0.1;

    const reviewCount = rec.reviewCount ?? rec.rating?.reviewCount;
    if (reviewCount && reviewCount > 100) confidence += 0.1;

    const priceAmount = typeof rec.price === 'number'
      ? rec.price
      : rec.price?.amount;
    if (priceAmount && priceAmount > 0) confidence += 0.05;

    const hasCoordinates = Boolean(
      rec.coordinates ||
      rec.location?.coordinates
    );
    if (hasCoordinates) confidence += 0.05;
    
    return Math.min(confidence, 1.0);
  }

  // Enhanced Criteria Extraction
  extractCriteria(tripRequest) {
    // Budget is optional - only use if provided and greater than 0
    const hasBudget = tripRequest.budget && tripRequest.budget.total && tripRequest.budget.total > 0;

    // Standardize currency - default to USD
    const currency = (tripRequest.budget?.currency || 'USD').toString().toUpperCase();
    console.log(`💱 Trip currency set to: ${currency}`);

    const baseCriteria = {
      // Core trip details
      tripId: this.tripId,
      origin: tripRequest.origin,
      destination: tripRequest.destination,
      departureDate: tripRequest.departureDate,
      returnDate: tripRequest.returnDate,
      travelers: tripRequest.travelers || 1,

      // Currency standardization - ALWAYS pass to all agents
      currency,

      // Budget information (INFORMATIONAL ONLY - not enforced)
      budgetInfo: hasBudget ? {
        total: tripRequest.budget.total,
        flight: tripRequest.budget.flight,
        accommodation: tripRequest.budget.accommodation,
        activity: tripRequest.budget.activity,
        restaurant: tripRequest.budget.restaurant,
        currency: currency
      } : null,

      // Flight criteria - NO maxPrice enforcement (budget is informational only)
      preferNonStop: tripRequest.preferences?.nonStopFlights,
      preferredClass: tripRequest.preferences?.flightClass || 'economy',

      // Accommodation criteria - NO maxPrice enforcement
      checkInDate: tripRequest.departureDate,
      checkOutDate: tripRequest.returnDate,
      accommodationType: tripRequest.preferences?.accommodationType,
      minRating: tripRequest.preferences?.minRating, // Let agent set defaults, don't enforce 4.0 here
      requiredAmenities: tripRequest.preferences?.amenities,

      // Activity criteria
      categories: tripRequest.interests || ['cultural', 'food'],
      difficulty: tripRequest.preferences?.activityLevel || 'easy',
      duration: tripRequest.preferences?.activityDuration,

      // Restaurant criteria
      cuisines: tripRequest.preferences?.cuisines,
      priceRange: tripRequest.preferences?.diningBudget || '$$',
      features: tripRequest.preferences?.restaurantFeatures,

      // Context for dependent agents
      executionContext: this.executionContext
    };

    console.log('📊 Extracted criteria - Budget handling:', {
      hasBudget,
      budgetIsInformationalOnly: true,
      budgetTotal: baseCriteria.budgetInfo?.total || 'none',
      note: 'Budget will not filter results - all options shown'
    });

    return baseCriteria;
  }

  initializeBudgetTracking(criteria) {
    this.executionContext.budgetTracking = {
      hasUserBudget: !!criteria.budgetInfo,
      userBudgetTotal: criteria.budgetInfo?.total || null,
      userBudgetByCategory: criteria.budgetInfo ? {
        flight: criteria.budgetInfo.flight || null,
        accommodation: criteria.budgetInfo.accommodation || null,
        activity: criteria.budgetInfo.activity || null,
        restaurant: criteria.budgetInfo.restaurant || null
      } : null,
      estimatedSpend: {
        flight: 0,
        accommodation: 0,
        activity: 0,
        restaurant: 0
      },
      totalEstimated: 0,
      note: 'Budget is for user reference only - not enforced by agents',
      currency: criteria.currency || 'USD'
    };

    if (criteria.budgetInfo) {
      console.log(`💰 User budget tracking initialized (informational only):`);
      console.log(`   Total: ${criteria.currency} ${criteria.budgetInfo.total}`);
      console.log(`   Note: Agents will show all options regardless of budget`);
    }
  }

  // Smart Agent Execution with Dependencies
  async executeAgentsWithDependencies(criteria, agentsToRun = ['flight', 'accommodation', 'activity', 'restaurant']) {
    const allResults = [];
    const executedAgents = new Set();
    const skippedAgents = new Set();

    console.log('Starting smart agent execution with dependencies...');
    console.log('📋 Execution order: accommodation → flights → experiences (activities & restaurants)');

    for (const phase of this.executionPhases) {
      // Filter agents in this phase to only include those in agentsToRun
      const agentsInPhase = phase.agents.filter(agent => agentsToRun.includes(agent));

      // Skip phase if no agents are selected to run
      if (agentsInPhase.length === 0) {
        console.log(`\n⏭️  Skipping phase: ${phase.description} (no agents selected)`);
        // Mark all agents in this phase as skipped
        for (const agentName of phase.agents) {
          if (!agentsToRun.includes(agentName)) {
            skippedAgents.add(agentName);
            await this.updateAgentStatus(agentName, 'skipped', {
              completedAt: new Date(),
              message: 'Agent not selected for execution'
            });
          }
        }
        continue;
      }

      console.log(`\n🔹 Executing phase: ${phase.description}`);
      console.log(`   Running agents: ${agentsInPhase.join(', ')}`);

      // Log UI visibility status
      if (phase.uiEnabled === false) {
        console.log('ℹ️  Note: This phase generates data but UI display is not yet implemented');
      }

      // Check if dependencies are met
      if (phase.dependencies) {
        const missingDeps = phase.dependencies.filter(dep => !executedAgents.has(dep) && !skippedAgents.has(dep));
        if (missingDeps.length > 0) {
          console.warn(`⚠️ Phase ${phase.phase} missing dependencies: ${missingDeps.join(', ')}`);
          continue;
        } else {
          const metDeps = phase.dependencies.filter(dep => executedAgents.has(dep));
          if (metDeps.length > 0) {
            console.log(`✅ Dependencies met: ${metDeps.join(', ')}`);
          }
        }
      }

      if (phase.parallel) {
        // Execute agents in parallel
        const phaseResults = await this.executeAgentsParallel(agentsInPhase, criteria);
        allResults.push(...phaseResults);
      } else {
        // Execute agents sequentially
        const phaseResults = await this.executeAgentsSequential(agentsInPhase, criteria);
        allResults.push(...phaseResults);
      }

      // Mark agents as executed and update context
      for (const agentName of agentsInPhase) {
        executedAgents.add(agentName);
        const agentResult = allResults.find(r => r.name === agentName);

        if (agentResult && agentResult.success) {
          await this.updateExecutionContext(agentName, agentResult);
        }
      }
    }

    return allResults;
  }

  /**
   * Execute only selected agents while respecting dependencies
   * @param {string[]} agentNames - Array of agent names to execute (e.g., ['flight', 'accommodation'])
   * @param {Object} criteria - Trip criteria
   * @returns {Promise<Array>} Array of agent execution results
   */
  async executeSelectedAgents(agentNames, criteria) {
    const allResults = [];
    const executedAgents = new Set();
    const skippedAgents = new Set();

    // Validate agent names
    const validAgents = ['flight', 'accommodation', 'activity', 'restaurant'];
    const invalidAgents = agentNames.filter(name => !validAgents.includes(name));
    if (invalidAgents.length > 0) {
      throw new Error(`Invalid agent names: ${invalidAgents.join(', ')}. Valid agents are: ${validAgents.join(', ')}`);
    }

    console.log('Starting selective agent execution...');
    console.log(`🎯 Requested agents: ${agentNames.join(', ')}`);

    // Create filtered execution phases
    const filteredPhases = this.executionPhases
      .map(phase => {
        // Filter agents in this phase to only include requested agents
        const agentsInPhase = phase.agents.filter(agent => agentNames.includes(agent));

        if (agentsInPhase.length === 0) {
          return null; // Phase will be removed
        }

        // Check for missing dependencies
        if (phase.dependencies) {
          const missingDeps = phase.dependencies.filter(dep => !agentNames.includes(dep));
          if (missingDeps.length > 0) {
            console.warn(`⚠️  Warning: Phase '${phase.phase}' depends on [${phase.dependencies.join(', ')}] but only [${agentNames.join(', ')}] will run`);
            console.warn(`   Missing dependencies: ${missingDeps.join(', ')}`);
            console.warn(`   Execution will proceed but results may be suboptimal`);
          }
        }

        return {
          ...phase,
          agents: agentsInPhase,
          originalAgents: phase.agents,
          skippedAgents: phase.agents.filter(agent => !agentNames.includes(agent))
        };
      })
      .filter(Boolean); // Remove null phases

    // Log execution plan
    console.log('📋 Filtered execution phases:');
    filteredPhases.forEach(phase => {
      console.log(`   - ${phase.phase}: ${phase.agents.join(', ')}`);
      if (phase.skippedAgents.length > 0) {
        console.log(`     (skipping: ${phase.skippedAgents.join(', ')})`);
      }
    });

    // Mark skipped agents
    const allRequestedAgents = new Set(agentNames);
    const allPossibleAgents = new Set(validAgents);
    const agentsToSkip = [...allPossibleAgents].filter(agent => !allRequestedAgents.has(agent));

    for (const agentName of agentsToSkip) {
      skippedAgents.add(agentName);
      await this.updateAgentStatus(agentName, 'skipped', {
        completedAt: new Date(),
        message: 'Agent not selected for execution'
      });
      console.log(`   ⏭️  Marked ${agentName} as skipped`);
    }

    // Execute filtered phases
    for (const phase of filteredPhases) {
      console.log(`\n🔹 Executing phase: ${phase.description}`);
      console.log(`   Running agents: ${phase.agents.join(', ')}`);

      // Log UI visibility status
      if (phase.uiEnabled === false) {
        console.log('ℹ️  Note: This phase generates data but UI display is not yet implemented');
      }

      // Check if dependencies are met (only check against executed agents)
      if (phase.dependencies) {
        const requestedDeps = phase.dependencies.filter(dep => agentNames.includes(dep));
        const missingDeps = requestedDeps.filter(dep => !executedAgents.has(dep));

        if (missingDeps.length > 0) {
          console.warn(`⚠️ Phase ${phase.phase} missing dependencies: ${missingDeps.join(', ')}`);
          console.warn(`   Skipping this phase`);
          continue;
        } else if (requestedDeps.length > 0) {
          console.log(`✅ Dependencies met: ${requestedDeps.join(', ')}`);
        }
      }

      // Execute agents in this phase
      let phaseResults;
      if (phase.parallel) {
        phaseResults = await this.executeAgentsParallel(phase.agents, criteria);
      } else {
        phaseResults = await this.executeAgentsSequential(phase.agents, criteria);
      }

      allResults.push(...phaseResults);

      // Mark agents as executed and update context
      for (const agentName of phase.agents) {
        executedAgents.add(agentName);
        const agentResult = allResults.find(r => r.name === agentName);

        if (agentResult && agentResult.success) {
          await this.updateExecutionContext(agentName, agentResult);
        }
      }
    }

    console.log(`\n✅ Selective execution completed: ${executedAgents.size} agents executed, ${skippedAgents.size} agents skipped`);

    return allResults;
  }

  async executeAgentsParallel(agentNames, criteria) {
    const promises = agentNames.map(async (agentName) => {
      return await this.executeAgent(agentName, criteria);
    });
    
    return await Promise.all(promises);
  }
  
  async executeAgentsSequential(agentNames, criteria) {
    const results = [];
    
    for (const agentName of agentNames) {
      const result = await this.executeAgent(agentName, criteria);
      results.push(result);
      
      // Update context immediately for next agent
      if (result.success) {
        await this.updateExecutionContext(agentName, result);
        // Update criteria with new context for next agent
        criteria.executionContext = this.executionContext;
      }
    }
    
    return results;
  }
  
  async executeAgent(agentName, criteria) {
    const agent = this.agents[agentName];
    const startTime = Date.now();
    
    try {
      console.log(`  Executing ${agentName} agent...`);
      await this.updateAgentStatus(agentName, 'running', { startedAt: new Date() });
      
      // Enhance criteria with context for dependent agents
      const enhancedCriteria = this.enhanceCriteriaForAgent(agentName, criteria);
      
      const result = await agent.execute({ criteria: enhancedCriteria });
      const duration = Date.now() - startTime;
      
      if (result.success) {
        const recommendations = result.data?.content?.recommendations || [];
        const storageResult = await this.storeRecommendations(agentName, recommendations);
        const confidence = this.calculateAgentConfidence(agentName, recommendations);
        const savedCount = storageResult.ids.length;
        const foundCount = recommendations.length;
        const statusAfterSave = savedCount > 0 || foundCount === 0 ? 'completed' : 'failed';
        const summary = {
          found: foundCount,
          saved: savedCount,
          errors: storageResult.errors.length
        };

        await this.updateAgentStatus(agentName, statusAfterSave, {
          completedAt: new Date(),
          duration,
          confidence,
          recommendationCount: savedCount
        });

        console.info(`${agent.constructor.name} saved:`, summary);

        if (statusAfterSave === 'completed') {
          console.log(`  ✅ ${agentName} completed: ${savedCount} recommendations (${duration}ms)`);
        } else {
          console.warn(`  ⚠️ ${agentName} produced ${foundCount} recommendations but none passed validation (${duration}ms)`);
        }

        return {
          name: agentName,
          ...result,
          success: statusAfterSave === 'completed',
          storedIds: storageResult.ids,
          confidence,
          duration,
          errors: storageResult.errors
        };
      } else {
        await this.updateAgentStatus(agentName, 'failed', {
          completedAt: new Date(),
          duration,
          errors: [{ message: result.error, timestamp: new Date() }]
        });
        
        console.info(`${agent.constructor.name} saved:`, { found: 0, saved: 0, errors: 1 });
        
        console.log(`  ❌ ${agentName} failed: ${result.error} (${duration}ms)`);
        
        return { name: agentName, ...result, duration };
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      await this.updateAgentStatus(agentName, 'failed', {
        completedAt: new Date(),
        duration,
        errors: [{ message: error.message, timestamp: new Date(), stack: error.stack }]
      });

      console.info(`${agent.constructor.name} saved:`, { found: 0, saved: 0, errors: 1 });
      
      console.log(`  💥 ${agentName} crashed: ${error.message} (${duration}ms)`);
      
      return {
        name: agentName,
        success: false,
        error: error.message,
        duration,
        executedAt: new Date().toISOString()
      };
    }
  }
  
  enhanceCriteriaForAgent(agentName, baseCriteria) {
    const enhanced = { ...baseCriteria };
    
    switch (agentName) {
      case 'activity':
        // Use hotel location for geographic clustering
        if (this.executionContext.hotelLocation) {
          enhanced.preferredArea = this.executionContext.hotelLocation;
          enhanced.maxDistanceFromHotel = 10; // km
          enhanced.geographicContext = this.executionContext.geographicClusters;
        }
        break;
        
      case 'restaurant':
        // Use activity locations and hotel location
        if (this.executionContext.selectedActivities.length > 0) {
          enhanced.activityLocations = this.executionContext.selectedActivities;
          enhanced.preferredAreas = this.executionContext.geographicClusters;
        }
        if (this.executionContext.hotelLocation) {
          enhanced.hotelLocation = this.executionContext.hotelLocation;
        }
        break;
    }

    return enhanced;
  }
  
  async updateExecutionContext(agentName, result) {
    const recommendations = result.data?.content?.recommendations || [];
    
    switch (agentName) {
      case 'accommodation':
        // Extract hotel location for geographic clustering
        if (recommendations.length > 0) {
          const bestHotel = recommendations[0];
          if (bestHotel.coordinates || bestHotel.location) {
            this.executionContext.hotelLocation = {
              name: bestHotel.name,
              coordinates: bestHotel.coordinates || bestHotel.location.coordinates,
              address: bestHotel.address || bestHotel.location
            };
            
            console.log(`  📍 Hotel location set: ${bestHotel.name}`);
          }
        }
        break;
        
      case 'activity':
        // Store activity locations for restaurant clustering
        this.executionContext.selectedActivities = recommendations.map(activity => ({
          name: activity.name,
          coordinates: activity.coordinates || activity.location?.coordinates,
          address: activity.address || activity.location,
          category: activity.category
        })).filter(a => a.coordinates);
        
        // Create geographic clusters
        this.executionContext.geographicClusters = this.createGeographicClusters([
          this.executionContext.hotelLocation,
          ...this.executionContext.selectedActivities
        ].filter(Boolean));
        
        console.log(`  🗺️  Geographic clusters created: ${this.executionContext.geographicClusters.length}`);
        break;
    }
    
    // Update budget tracking
    this.updateBudgetTracking(agentName, recommendations);
  }
  
  createGeographicClusters(locations) {
    if (locations.length < 2) return [];
    
    const clusters = [];
    const maxDistance = 2; // km for clustering
    
    for (const location of locations) {
      let addedToCluster = false;
      
      for (const cluster of clusters) {
        const clusterCenter = this.calculateClusterCenter(cluster.locations);
        const distance = this.calculateDistance(
          location.coordinates,
          clusterCenter
        );
        
        if (distance <= maxDistance) {
          cluster.locations.push(location);
          addedToCluster = true;
          break;
        }
      }
      
      if (!addedToCluster) {
        clusters.push({
          id: `cluster_${clusters.length + 1}`,
          locations: [location],
          center: location.coordinates
        });
      }
    }
    
    return clusters;
  }
  
  calculateClusterCenter(locations) {
    if (locations.length === 0) return null;
    
    const avgLat = locations.reduce((sum, loc) => sum + (loc.coordinates?.latitude || 0), 0) / locations.length;
    const avgLng = locations.reduce((sum, loc) => sum + (loc.coordinates?.longitude || 0), 0) / locations.length;
    
    return { latitude: avgLat, longitude: avgLng };
  }
  
  calculateDistance(coord1, coord2) {
    if (!coord1 || !coord2) return Infinity;
    
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(coord2.latitude - coord1.latitude);
    const dLon = this.toRadians(coord2.longitude - coord1.longitude);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(this.toRadians(coord1.latitude)) * Math.cos(this.toRadians(coord2.latitude)) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }
  
  calculateAgentConfidence(agentName, recommendations) {
    if (!recommendations || recommendations.length === 0) return 0;
    
    const scores = recommendations.map(rec => rec.confidence || this.calculateRecommendationConfidence(rec));
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }
  
  updateBudgetTracking(agentName, recommendations) {
    try {
      // Ensure budgetTracking exists
      if (!this.executionContext?.budgetTracking) {
        console.warn('⚠️  Budget tracking not initialized, skipping update');
        return;
      }

      // Ensure estimatedSpend exists - use null-safe initialization
      if (!this.executionContext.budgetTracking.estimatedSpend || typeof this.executionContext.budgetTracking.estimatedSpend !== 'object') {
        this.executionContext.budgetTracking.estimatedSpend = {
          flight: 0,
          accommodation: 0,
          activity: 0,
          restaurant: 0
        };
        console.log('💰 Initialized estimatedSpend object');
      }

      if (!recommendations || recommendations.length === 0) {
        console.log(`💰 ${agentName}: No recommendations to track`);
        return;
      }

      // Validate agentName
      if (!agentName || typeof agentName !== 'string') {
        console.warn('⚠️  Invalid agentName for budget tracking:', agentName);
        return;
      }

      // Calculate estimate for this agent - handle different price structures
      const totalEstimate = recommendations.reduce((sum, rec) => {
        // Try multiple price formats
        const price = rec?.price?.amount || rec?.price || rec?.cost || 0;
        return sum + (typeof price === 'number' ? price : 0);
      }, 0);

      // Safely update the specific agent's estimate
      // Ensure the estimatedSpend object hasn't been corrupted
      if (this.executionContext.budgetTracking.estimatedSpend && typeof this.executionContext.budgetTracking.estimatedSpend === 'object') {
        this.executionContext.budgetTracking.estimatedSpend[agentName] = totalEstimate;
      } else {
        console.error('❌ estimatedSpend object was corrupted, reinitializing');
        this.executionContext.budgetTracking.estimatedSpend = {
          flight: 0,
          accommodation: 0,
          activity: 0,
          restaurant: 0,
          [agentName]: totalEstimate
        };
      }

      // Recalculate total
      const allEstimates = Object.values(this.executionContext.budgetTracking.estimatedSpend || {});
      this.executionContext.budgetTracking.totalEstimated = allEstimates.reduce(
        (sum, val) => sum + (val || 0),
        0
      );

      // Log the update
      const userBudgetForAgent = this.executionContext.budgetTracking.userBudgetByCategory?.[agentName];
      console.log(`💰 Budget tracking updated for ${agentName}:`, {
        recommendationCount: recommendations.length,
        agentEstimate: `$${totalEstimate.toFixed(2)}`,
        userBudget: userBudgetForAgent ? `$${userBudgetForAgent}` : 'not set',
        totalEstimated: `$${this.executionContext.budgetTracking.totalEstimated.toFixed(2)}`,
        userBudgetTotal: this.executionContext.budgetTracking.userBudgetTotal
          ? `$${this.executionContext.budgetTracking.userBudgetTotal}`
          : 'not set'
      });

    } catch (error) {
      console.error(`❌ Error updating budget tracking for ${agentName}:`, error.message);
      console.error('   Stack:', error.stack);
      console.error('   Context state:', {
        hasExecutionContext: !!this.executionContext,
        hasBudgetTracking: !!this.executionContext?.budgetTracking,
        hasEstimatedSpend: !!this.executionContext?.budgetTracking?.estimatedSpend,
        agentName,
        recommendationsCount: recommendations?.length
      });
      // Don't throw - budget tracking is informational, shouldn't break the trip
    }
  }

  // Enhanced Trip Plan Synthesis
  async synthesizeEnhancedTripPlan(agentResults, criteria) {
    const plan = { ...this.tripSchema };
    
    console.log('Synthesizing enhanced trip plan...');
    
    // Populate recommendations from each agent
    const successfulAgents = agentResults.filter(r => r.success);
    const failedAgents = agentResults.filter(r => !r.success);
    
    console.log(`Successful agents: ${successfulAgents.length}, Failed agents: ${failedAgents.length}`);
    
    successfulAgents.forEach(result => {
      if (result.data?.content?.recommendations) {
        plan.recommendations[result.name] = result.data.content.recommendations;
      }
    });

    // Enhanced budget analysis with actual vs allocated
    plan.tripSummary.budget = this.calculateEnhancedBudget(plan.recommendations, criteria);
    plan.tripSummary.destination = criteria.destination;
    plan.tripSummary.dates = {
      departure: criteria.departureDate,
      return: criteria.returnDate
    };
    
    // Geographic coverage analysis
    plan.tripSummary.geographicCoverage = this.calculateGeographicCoverage();

    // Enhanced itinerary with geographic clustering
    plan.itinerary = await this.generateEnhancedItinerary(plan.recommendations, criteria);
    
    // Budget validation and warnings
    plan.metadata.budgetValidation = this.validateBudgetConstraints(criteria);
    
    // Geographic analysis
    plan.metadata.geographicAnalysis = {
      clusters: this.executionContext.geographicClusters,
      hotelLocation: this.executionContext.hotelLocation,
      coverage: plan.tripSummary.geographicCoverage
    };
    
    // Failed agents handling
    if (failedAgents.length > 0) {
      plan.metadata.failedAgents = failedAgents.map(agent => ({
        name: agent.name,
        error: agent.error,
        impact: this.assessAgentFailureImpact(agent.name)
      }));
    }

    return plan;
  }
  
  calculateEnhancedBudget(recommendations, criteria) {
    const breakdown = {};
    let total = 0;
    const tracking = this.executionContext.budgetTracking;
    
    // Calculate actual costs from recommendations
    Object.entries(recommendations).forEach(([category, recs]) => {
      if (recs && recs.length > 0) {
        const categoryTotal = this.calculateCategoryBudget(category, recs, criteria);
        breakdown[category] = {
          estimated: categoryTotal,
          allocated: tracking.allocated[category] || 0,
          variance: categoryTotal - (tracking.allocated[category] || 0),
          recommendations: recs.length
        };
        total += categoryTotal;
      }
    });
    
    return {
      total,
      allocated: tracking.totalAllocated,
      variance: total - tracking.totalAllocated,
      breakdown,
      analysis: this.generateBudgetAnalysis(breakdown, criteria)
    };
  }
  
  calculateCategoryBudget(category, recommendations, criteria) {
    const topRec = recommendations[0];
    if (!topRec) return 0;
    
    switch (category) {
      case 'flight':
        return (topRec.price || 0) * (criteria.travelers || 1);
      case 'accommodation':
        const nights = this.calculateNights(criteria.departureDate, criteria.returnDate);
        return (topRec.price || 0) * nights;
      case 'activity':
        return recommendations.slice(0, 3).reduce((sum, activity) => 
          sum + ((activity.price || 0) * (criteria.travelers || 1)), 0);
      case 'restaurant':
        return recommendations.slice(0, 3).reduce((sum, restaurant) =>
          sum + ((restaurant.averageMeal || restaurant.price || 0) * (criteria.travelers || 1)), 0);
      default:
        return topRec.price || 0;
    }
  }
  
  calculateNights(departureDate, returnDate) {
    if (!returnDate) return 1;
    const departure = new Date(departureDate);
    const returnD = new Date(returnDate);
    return Math.max(1, Math.ceil((returnD - departure) / (1000 * 60 * 60 * 24)));
  }
  
  calculateGeographicCoverage() {
    const clusters = this.executionContext.geographicClusters;
    if (clusters.length === 0) return 0;
    
    const totalLocations = this.executionContext.selectedActivities.length + 
                          (this.executionContext.hotelLocation ? 1 : 0);
    
    if (totalLocations === 0) return 0;
    
    // Calculate spread efficiency (fewer clusters = better geographic efficiency)
    const efficiency = Math.max(0, 1 - (clusters.length - 1) / totalLocations);
    return Math.round(efficiency * 100);
  }
  
  validateBudgetConstraints(criteria) {
    const tracking = this.executionContext.budgetTracking;
    const warnings = [];
    const recommendations = [];
    
    Object.entries(tracking.spent).forEach(([category, spent]) => {
      const allocated = tracking.allocated[category] || 0;
      
      if (allocated > 0) {
        const variance = spent - allocated;
        const percentOver = (variance / allocated) * 100;
        
        if (percentOver > 20) {
          warnings.push(`${category} budget exceeded by ${percentOver.toFixed(1)}%`);
          recommendations.push(`Consider reducing ${category} selections or increasing budget`);
        } else if (percentOver > 10) {
          warnings.push(`${category} budget over by ${percentOver.toFixed(1)}%`);
        }
      }
    });
    
    return {
      isWithinBudget: warnings.length === 0,
      warnings,
      recommendations,
      totalVariance: tracking.spent - tracking.totalAllocated
    };
  }
  
  generateBudgetAnalysis(breakdown, criteria) {
    const insights = [];
    const totalBudget = criteria.totalBudget || 0;
    
    if (totalBudget > 0) {
      Object.entries(breakdown).forEach(([category, data]) => {
        const percentage = (data.estimated / totalBudget) * 100;
        
        if (percentage > 40) {
          insights.push(`${category} represents ${percentage.toFixed(1)}% of total budget - consider optimizing`);
        }
      });
    }
    
    return {
      insights,
      recommendedAdjustments: this.generateBudgetRecommendations(breakdown)
    };
  }
  
  generateBudgetRecommendations(breakdown) {
    const recs = [];
    
    Object.entries(breakdown).forEach(([category, data]) => {
      if (data.variance > 0 && data.allocated > 0) {
        const overBy = (data.variance / data.allocated) * 100;
        if (overBy > 15) {
          recs.push(`Consider budget-friendly ${category} alternatives or increase allocation by $${data.variance}`);
        }
      }
    });
    
    return recs;
  }
  
  assessAgentFailureImpact(agentName) {
    const impacts = {
      flight: 'critical - trip cannot proceed without flights',
      accommodation: 'critical - lodging required for trip',
      activity: 'moderate - reduces trip experience but not essential',
      restaurant: 'low - dining options available elsewhere'
    };

    return impacts[agentName] || 'unknown impact';
  }
  
  async generateEnhancedItinerary(recommendations, criteria) {
    const itinerary = [];
    const startDate = new Date(criteria.departureDate);
    const endDate = new Date(criteria.returnDate || criteria.departureDate);
    const days = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
    
    console.log(`Generating ${days}-day enhanced itinerary...`);
    
    const activities = recommendations.activity || [];
    const restaurants = recommendations.restaurant || [];
    const clusters = this.executionContext.geographicClusters;
    
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      const dayActivities = this.selectActivitiesForDay(activities, i, clusters);
      const dayRestaurants = this.selectRestaurantsForDay(restaurants, dayActivities, i, clusters);
      
      itinerary.push({
        date: date.toISOString().split('T')[0],
        day: i + 1,
        activities: dayActivities,
        restaurants: dayRestaurants,
        geographicCluster: clusters[i % clusters.length]?.id || null,
        estimatedBudget: this.calculateDayBudget(dayActivities, dayRestaurants),
        notes: this.generateDayNotes(i, days, dayActivities)
      });
    }
    
    return itinerary;
  }
  
  selectActivitiesForDay(activities, dayIndex, clusters) {
    if (!activities || activities.length === 0) return [];
    
    // Distribute activities across days, prioritizing by cluster if available
    const activitiesPerDay = Math.ceil(activities.length / Math.max(1, clusters.length));
    const startIndex = dayIndex * activitiesPerDay;
    
    return activities.slice(startIndex, startIndex + activitiesPerDay);
  }
  
  selectRestaurantsForDay(restaurants, dayActivities, dayIndex, clusters) {
    if (!restaurants || restaurants.length === 0) return [];
    
    // Select 1-2 restaurants per day, preferring those near activities
    const dayRestaurants = [];
    
    if (dayIndex < restaurants.length) {
      dayRestaurants.push(restaurants[dayIndex]);
    }
    
    // Add second restaurant if available and it's not the last day
    if (restaurants.length > dayIndex + 1 && dayActivities.length > 1) {
      const secondIndex = (dayIndex + Math.floor(restaurants.length / 2)) % restaurants.length;
      if (secondIndex !== dayIndex) {
        dayRestaurants.push(restaurants[secondIndex]);
      }
    }
    
    return dayRestaurants;
  }
  
  calculateDayBudget(activities, restaurants) {
    const activityCost = activities.reduce((sum, activity) => sum + (activity.price || 0), 0);
    const restaurantCost = restaurants.reduce((sum, restaurant) => sum + (restaurant.averageMeal || restaurant.price || 0), 0);
    
    return activityCost + restaurantCost;
  }
  
  generateDayNotes(dayIndex, totalDays, activities) {
    if (dayIndex === 0) return 'Arrival day - lighter activities recommended';
    if (dayIndex === totalDays - 1) return 'Departure day - plan activities near hotel/airport';
    if (activities.length > 2) return 'Full day - allow extra time for transportation';
    return '';
  }

  // Enhanced Final Recommendations with AI Synthesis
  async generateEnhancedRecommendations(tripPlan, criteria) {
    console.log('Generating enhanced final recommendations with AI synthesis...');
    
    const prompt = `
Analyze this comprehensive trip plan and provide enhanced recommendations:

Trip Context:
- Destination: ${criteria.destination}
- Dates: ${criteria.departureDate} to ${criteria.returnDate}
- Travelers: ${criteria.travelers}
- Budget Analysis: ${JSON.stringify(tripPlan.tripSummary.budget, null, 2)}
- Geographic Coverage: ${tripPlan.tripSummary.geographicCoverage}%

Recommendation Summary:
${Object.entries(tripPlan.recommendations).map(([type, recs]) => 
  `${type}: ${recs?.length || 0} options`).join('\
')}

Budget Validation:
${JSON.stringify(tripPlan.metadata.budgetValidation, null, 2)}

Geographic Clusters:
${JSON.stringify(tripPlan.metadata.geographicAnalysis?.clusters || [], null, 2)}

Please provide:
1. Overall trip confidence score (0-100) based on recommendation quality and geographic efficiency
2. Top insights about the trip plan
3. Optimization suggestions for budget and logistics
4. Risk assessment and mitigation strategies
5. Alternative approaches for different preferences

Focus on practical, actionable insights for the traveler.
    `;

    try {
      const aiResponse = await this.generateStructuredResponse(prompt, {
        overallConfidence: 0,
        insights: [],
        optimizations: [],
        risks: [],
        alternatives: []
      });
      
      const finalPlan = {
        ...tripPlan,
        tripSummary: {
          ...tripPlan.tripSummary,
          confidence: aiResponse.content?.overallConfidence || this.calculateOverallConfidence(tripPlan)
        },
        metadata: {
          ...tripPlan.metadata,
          aiInsights: aiResponse.content?.insights || [],
          optimizations: aiResponse.content?.optimizations || [],
          riskAssessment: aiResponse.content?.risks || [],
          alternatives: aiResponse.content?.alternatives || []
        }
      };
      
      console.log(`Final trip confidence: ${finalPlan.tripSummary.confidence}%`);
      return finalPlan;
      
    } catch (error) {
      console.error('AI synthesis failed, calculating basic confidence:', error.message);
      
      return {
        ...tripPlan,
        tripSummary: {
          ...tripPlan.tripSummary,
          confidence: this.calculateOverallConfidence(tripPlan)
        },
        metadata: {
          ...tripPlan.metadata,
          aiInsights: ['AI synthesis unavailable - using calculated confidence'],
          synthesisError: error.message
        }
      };
    }
  }
  
  calculateOverallConfidence(tripPlan) {
    let totalConfidence = 0;
    let weightedScore = 0;
    
    // Agent weights based on importance (normalized without transportation)
    const agentWeights = {
      flight: 0.30,
      accommodation: 0.30,
      activity: 0.25,
      restaurant: 0.15
    };
    
    Object.entries(tripPlan.recommendations).forEach(([agentType, recs]) => {
      if (recs && recs.length > 0) {
        const avgConfidence = recs.reduce((sum, rec) => 
          sum + (rec.confidence || 0.7), 0) / recs.length;
        
        const weight = agentWeights[agentType] || 0.1;
        weightedScore += avgConfidence * weight;
        totalConfidence += weight;
      }
    });
    
    const baseConfidence = totalConfidence > 0 ? (weightedScore / totalConfidence) : 0.5;
    
    // Apply bonuses/penalties
    let finalConfidence = baseConfidence;
    
    // Geographic efficiency bonus
    const geoEfficiency = tripPlan.tripSummary.geographicCoverage / 100;
    finalConfidence += (geoEfficiency - 0.5) * 0.1;
    
    // Budget compliance bonus/penalty
    const budgetValidation = tripPlan.metadata.budgetValidation;
    if (budgetValidation?.isWithinBudget) {
      finalConfidence += 0.05;
    } else if (budgetValidation?.warnings?.length > 0) {
      finalConfidence -= 0.1;
    }
    
    // Failed agents penalty
    const failedAgents = tripPlan.metadata.failedAgents || [];
    finalConfidence -= failedAgents.length * 0.1;
    
    return Math.round(Math.max(0, Math.min(1, finalConfidence)) * 100);
  }

  getAgentStatus() {
    return Object.entries(this.agents).map(([name, agent]) => ({
      name,
      status: agent.getStatus()
    }));
  }

  // Enhanced method using GeographicService for itinerary validation
  async validateTripFeasibility(tripPlan, travelPreferences = {}) {
    console.log('Validating trip feasibility using GeographicService...');
    
    const itineraryFlags = geographicService.flagUnrealisticItineraries(
      tripPlan.itinerary || [],
      {
        travelStyle: travelPreferences.style || 'moderate',
        transportMode: travelPreferences.transport || 'mixed',
        dailyHours: travelPreferences.dailyHours || 8
      }
    );

    // Validate each day individually
    const dayValidations = [];
    for (const day of tripPlan.itinerary || []) {
      const dayLocations = [...(day.activities || []), ...(day.restaurants || [])];
      
      if (dayLocations.length > 0) {
        const validation = geographicService.validateLocationFeasibility(dayLocations, {
          travelStyle: travelPreferences.style || 'moderate',
          transportMode: travelPreferences.transport || 'mixed',
          availableTime: travelPreferences.dailyHours || 8
        });
        
        dayValidations.push({
          day: day.day,
          date: day.date,
          ...validation
        });
      }
    }

    return {
      overallFeasible: !itineraryFlags.hasIssues,
      flags: itineraryFlags.flags,
      severity: itineraryFlags.overallSeverity,
      summary: itineraryFlags.summary,
      dailyValidations: dayValidations,
      recommendations: this.generateFeasibilityRecommendations(itineraryFlags, dayValidations)
    };
  }

  generateFeasibilityRecommendations(itineraryFlags, dayValidations) {
    const recommendations = [];
    
    if (itineraryFlags.hasIssues) {
      const routingIssues = itineraryFlags.flags.filter(f => f.type === 'routing');
      const feasibilityIssues = itineraryFlags.flags.filter(f => f.type === 'feasibility');
      
      if (routingIssues.length > 0) {
        recommendations.push('Consider reordering activities by geographic location to reduce travel time');
      }
      
      if (feasibilityIssues.length > 0) {
        recommendations.push('Reduce the number of daily activities or choose closer alternatives');
      }
    }
    
    const averageScore = dayValidations.reduce((sum, day) => sum + day.score, 0) / dayValidations.length;
    if (averageScore < 70) {
      recommendations.push('Overall itinerary is quite packed - consider a more relaxed pace');
    }
    
    return recommendations;
  }
}
