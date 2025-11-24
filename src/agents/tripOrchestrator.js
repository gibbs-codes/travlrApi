import { BaseAgent } from './baseAgent.js';
import { FlightAgent } from './flightAgent.js';
import { AccommodationAgent } from './accommodationAgent.js';
import { ActivityAgent } from './activityAgent.js';
import { RestaurantAgent } from './restaurantAgent.js';
import { Trip, Recommendation } from '../models/index.js';
import databaseService from '../services/database.js';
import geographicService from '../services/geographicService.js';
import logger from '../utils/logger.js';
import { AGENT_TYPES } from '../constants/agentTypes.js';

export class TripOrchestrator extends BaseAgent {
  constructor(aiConfig = {}, tripId = null) {
    super(
      'TripOrchestrator',
      ['trip_planning', 'agent_coordination', 'result_synthesis', 'database_integration'],
      aiConfig
    );

    this.tripId = tripId;
    this.trip = null;
    this.logger = logger.child({ scope: 'TripOrchestrator' });
    this.executionContext = {
      hotelLocation: null,
      selectedActivities: [],
      geographicClusters: []
    };

    this.logInfo = this.logInfo.bind(this);
    this.logWarn = this.logWarn.bind(this);
    this.logError = this.logError.bind(this);

    // Initialize specialized agents
    this.agents = {
      [AGENT_TYPES.FLIGHT]: new FlightAgent(aiConfig),
      [AGENT_TYPES.ACCOMMODATION]: new AccommodationAgent(aiConfig),
      [AGENT_TYPES.ACTIVITY]: new ActivityAgent(aiConfig),
      [AGENT_TYPES.RESTAURANT]: new RestaurantAgent(aiConfig)
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
        geographicAnalysis: {}
      }
    };
  }

  formatLogArgs(args) {
    return args.map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) {
        return `${arg.message}\n${arg.stack}`;
      }
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }).join(' ');
  }

  logInfo(...args) {
    this.logger.info(this.formatLogArgs(args));
  }

  logWarn(...args) {
    this.logger.warn(this.formatLogArgs(args));
  }

  logError(...args) {
    this.logger.error(this.formatLogArgs(args));
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

      this.logInfo(`Starting enhanced trip planning for: ${tripRequest.destination}`);
      await this.updateTripStatus('in_progress', { startedAt: new Date() });

      // Extract and validate trip criteria
      const criteria = this.extractCriteria(tripRequest);

      // Determine which agents to run
      const agentsToRun = tripRequest.agentsToRun;
      const allAgents = ['flight', 'accommodation', 'activity', 'restaurant'];
      let agentResults;

      // Determine requested agents with default fallback
      const requestedAgents = agentsToRun && Array.isArray(agentsToRun) && agentsToRun.length > 0
        ? agentsToRun
        : allAgents;

      this.logInfo(`🎯 TripOrchestrator will execute agents: ${requestedAgents.join(', ')}`);

      // Log skipped agents if any
      const skippedAgents = allAgents.filter(a => !requestedAgents.includes(a));
      if (skippedAgents.length > 0) {
        this.logInfo(`⏭️  Skipping agents: ${skippedAgents.join(', ')}`);
      }

      if (agentsToRun && Array.isArray(agentsToRun) && agentsToRun.length > 0) {
        // Use selective agent execution
        this.logInfo(`🎯 Selective execution mode enabled`);
        agentResults = await this.executeSelectedAgents(agentsToRun, criteria);
      } else {
        // Execute all agents (backward compatibility)
        this.logInfo(`🎯 Full execution mode: all agents`);
        agentResults = await this.executeAgentsWithDependencies(criteria, allAgents);
      }
      
      this.logInfo('Enhanced agent execution completed:', {
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
            geographicAnalysis: this.executionContext.geographicClusters
          }
        },
        executedAt: new Date().toISOString()
      };

    } catch (error) {
      this.logError('Trip orchestrator execution failed:', error);

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
        this.logInfo(`Loaded trip ${this.trip.tripId} from database`);
      }
    } catch (error) {
      this.logError('Failed to load trip from database:', error);
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
      this.logInfo(`Updated trip ${this.tripId} status to: ${status}`);
    } catch (error) {
      this.logError('Failed to update trip status:', error);
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
      this.logError(`Failed to update ${agentName} agent status:`, error);
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
      this.logWarn('Cannot determine trip status - trip not loaded');
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

    this.logInfo('📊 Final agent statuses:', agentStatuses);

    // Check if any agent failed
    const hasFailedAgent = agentStatuses.some(agent => agent.status === 'failed');

    // Check if all agents completed
    const allCompleted = agentStatuses.every(agent =>
      agent.status === 'completed' || agent.status === 'skipped'
    );

    if (hasFailedAgent) {
      this.logWarn('⚠️ One or more agents failed - marking trip as failed');
      return 'failed';
    }

    if (allCompleted) {
      this.logInfo('✅ All agents completed successfully - marking trip as recommendations_ready');
      return 'recommendations_ready';
    }

    // Default to failed if status is unclear
    this.logWarn('⚠️ Agent execution status unclear - marking trip as failed');
    return 'failed';
  }

  /**
   * Update the top-level trip status field
   */
  async updateTopLevelTripStatus(status) {
    if (!this.tripId) return;

    try {
      await Trip.findByIdAndUpdate(this.tripId, { status });
      this.logInfo(`✅ Updated trip status to: ${status}`);
    } catch (error) {
      this.logError('Failed to update top-level trip status:', error);
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

        this.logError(`❌ Failed to normalize ${agentName} recommendation "${rawRecommendation?.name || rawRecommendation?.title || 'Unknown'}":`, message);
      }
    });

    if (recommendations.length > 0 && normalizedEntries.length === 0) {
      const errorSummary = errorEntries.map((e) => e.message).join(' | ') || 'No normalization details available';
      this.logWarn(`⚠️ ${agentName} normalization produced 0 records out of ${recommendations.length}. Reasons: ${errorSummary}`);
    }

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

            this.logError(`❌ Failed to insert ${agentName} recommendation "${failedEntry?.raw?.name || 'Unknown'}":`, writeError.errmsg || writeError.message);
          }
        } else if (error.errors) {
          Object.values(error.errors).forEach((err) => {
            errorEntries.push({
              message: err.message,
              timestamp: new Date(),
              stack: err.stack
            });
            this.logError(`❌ Validation error for ${agentName} recommendation: ${err.message}`);
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

    if (normalizedEntries.length > 0 && recommendationIds.length === 0) {
      const errorSummary = errorEntries.map((e) => e.message).join(' | ') || 'No insertion error details captured';
      this.logWarn(`⚠️ ${agentName} recommendations normalized (${normalizedEntries.length}) but none saved. Reasons: ${errorSummary}`);
    }

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
      this.logError(`Failed to update trip with ${agentName} recommendations:`, error);
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
      this.logInfo(`🔍 Normalizing restaurant recommendation:`, {
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

    let currency = rawRecommendation?.price?.currency || rawRecommendation?.currency || 'USD';
    if (typeof currency === 'string') {
      currency = currency.trim().toUpperCase().slice(0, 3) || 'USD';
    } else {
      currency = 'USD';
    }

    // Log currency mismatch if not USD
    const requestedCurrency = rawRecommendation?.requestedCurrency || 'USD';
    if (currency !== requestedCurrency && safeAmount > 0) {
      this.logWarn(`⚠️ ${agentName} currency mismatch: expected ${requestedCurrency}, got ${currency} for ${rawRecommendation.name || 'item'} (${safeAmount} ${currency})`);
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
      lat: latNumber,
      lng: lonNumber
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
    // Standardize currency - default to USD
    const currency = (tripRequest.preferences?.currency || 'USD').toString().toUpperCase();
    this.logInfo(`💱 Trip currency set to: ${currency}`);

    return {
      // Core trip details
      tripId: this.tripId,
      origin: tripRequest.origin,
      destination: tripRequest.destination,
      destinationCountry: tripRequest.destinationCountry || tripRequest.preferences?.destinationCountry,
      destinationPlaceId: tripRequest.destinationPlaceId || tripRequest.preferences?.destinationPlaceId,
      departureDate: tripRequest.departureDate,
      returnDate: tripRequest.returnDate,
      travelers: tripRequest.travelers || 1,

      // Currency standardization - ALWAYS pass to all agents
      currency,

      // Flight criteria
      preferNonStop: tripRequest.preferences?.nonStopFlights,
      preferredClass: tripRequest.preferences?.flightClass || 'economy',

      // Accommodation criteria
      checkInDate: tripRequest.departureDate,
      checkOutDate: tripRequest.returnDate,
      accommodationType: tripRequest.preferences?.accommodationType,
      minRating: tripRequest.preferences?.minRating,
      requiredAmenities: tripRequest.preferences?.amenities,

      // Activity criteria
      categories: tripRequest.interests || ['cultural', 'food'],
      difficulty: tripRequest.preferences?.activityLevel || 'easy',
      duration: tripRequest.preferences?.activityDuration,

      // Restaurant criteria
      cuisines: tripRequest.preferences?.cuisines,
      features: tripRequest.preferences?.restaurantFeatures,

      // Context for dependent agents
      executionContext: this.executionContext
    };
  }

  // Smart Agent Execution with Dependencies
  async executeAgentsWithDependencies(criteria, agentsToRun = ['flight', 'accommodation', 'activity', 'restaurant']) {
    const allResults = [];
    const executedAgents = new Set();
    const skippedAgents = new Set();

    this.logInfo('Starting smart agent execution with dependencies...');
    this.logInfo('📋 Execution order: accommodation → flights → experiences (activities & restaurants)');

    for (const phase of this.executionPhases) {
      // Filter agents in this phase to only include those in agentsToRun
      const agentsInPhase = phase.agents.filter(agent => agentsToRun.includes(agent));

      // Skip phase if no agents are selected to run
      if (agentsInPhase.length === 0) {
        this.logInfo(`\n⏭️  Skipping phase: ${phase.description} (no agents selected)`);
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

      this.logInfo(`\n🔹 Executing phase: ${phase.description}`);
      this.logInfo(`   Running agents: ${agentsInPhase.join(', ')}`);

      // Log UI visibility status
      if (phase.uiEnabled === false) {
        this.logInfo('ℹ️  Note: This phase generates data but UI display is not yet implemented');
      }

      // Check if dependencies are met
      if (phase.dependencies) {
        const missingDeps = phase.dependencies.filter(dep => !executedAgents.has(dep) && !skippedAgents.has(dep));
        if (missingDeps.length > 0) {
          this.logWarn(`⚠️ Phase ${phase.phase} missing dependencies: ${missingDeps.join(', ')}`);
          continue;
        } else {
          const metDeps = phase.dependencies.filter(dep => executedAgents.has(dep));
          if (metDeps.length > 0) {
            this.logInfo(`✅ Dependencies met: ${metDeps.join(', ')}`);
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

    this.logInfo('Starting selective agent execution...');
    this.logInfo(`🎯 Requested agents: ${agentNames.join(', ')}`);

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
            this.logWarn(`⚠️  Warning: Phase '${phase.phase}' depends on [${phase.dependencies.join(', ')}] but only [${agentNames.join(', ')}] will run`);
            this.logWarn(`   Missing dependencies: ${missingDeps.join(', ')}`);
            this.logWarn(`   Execution will proceed but results may be suboptimal`);
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
    this.logInfo('📋 Filtered execution phases:');
    filteredPhases.forEach(phase => {
      this.logInfo(`   - ${phase.phase}: ${phase.agents.join(', ')}`);
      if (phase.skippedAgents.length > 0) {
        this.logInfo(`     (skipping: ${phase.skippedAgents.join(', ')})`);
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
      this.logInfo(`   ⏭️  Marked ${agentName} as skipped`);
    }

    // Execute filtered phases
    for (const phase of filteredPhases) {
      this.logInfo(`\n🔹 Executing phase: ${phase.description}`);
      this.logInfo(`   Running agents: ${phase.agents.join(', ')}`);

      // Log UI visibility status
      if (phase.uiEnabled === false) {
        this.logInfo('ℹ️  Note: This phase generates data but UI display is not yet implemented');
      }

      // Check if dependencies are met (only check against executed agents)
      if (phase.dependencies) {
        const requestedDeps = phase.dependencies.filter(dep => agentNames.includes(dep));
        const missingDeps = requestedDeps.filter(dep => !executedAgents.has(dep));

        if (missingDeps.length > 0) {
          this.logWarn(`⚠️ Phase ${phase.phase} missing dependencies: ${missingDeps.join(', ')}`);
          this.logWarn(`   Skipping this phase`);
          continue;
        } else if (requestedDeps.length > 0) {
          this.logInfo(`✅ Dependencies met: ${requestedDeps.join(', ')}`);
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

    this.logInfo(`\n✅ Selective execution completed: ${executedAgents.size} agents executed, ${skippedAgents.size} agents skipped`);

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
      this.logInfo(`  Executing ${agentName} agent...`);
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

        this.logInfo(`${agent.constructor.name} saved:`, summary);

        if (statusAfterSave === 'completed') {
          this.logInfo(`  ✅ ${agentName} completed: ${savedCount} recommendations (${duration}ms)`);
        } else {
          this.logWarn(`  ⚠️ ${agentName} produced ${foundCount} recommendations but none passed validation (${duration}ms)`);
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
        
        this.logInfo(`${agent.constructor.name} saved:`, { found: 0, saved: 0, errors: 1 });
        
        this.logInfo(`  ❌ ${agentName} failed: ${result.error} (${duration}ms)`);
        
        return { name: agentName, ...result, duration };
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      await this.updateAgentStatus(agentName, 'failed', {
        completedAt: new Date(),
        duration,
        errors: [{ message: error.message, timestamp: new Date(), stack: error.stack }]
      });

      this.logInfo(`${agent.constructor.name} saved:`, { found: 0, saved: 0, errors: 1 });
      
      this.logInfo(`  💥 ${agentName} crashed: ${error.message} (${duration}ms)`);
      
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
            
            this.logInfo(`  📍 Hotel location set: ${bestHotel.name}`);
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
        
        this.logInfo(`  🗺️  Geographic clusters created: ${this.executionContext.geographicClusters.length}`);
        break;
    }
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

    const avgLat = locations.reduce((sum, loc) => sum + (loc.coordinates?.lat || 0), 0) / locations.length;
    const avgLng = locations.reduce((sum, loc) => sum + (loc.coordinates?.lng || 0), 0) / locations.length;

    return { lat: avgLat, lng: avgLng };
  }
  
  calculateDistance(coord1, coord2) {
    if (!coord1 || !coord2) return Infinity;

    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(coord2.lat - coord1.lat);
    const dLon = this.toRadians(coord2.lng - coord1.lng);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(this.toRadians(coord1.lat)) * Math.cos(this.toRadians(coord2.lat)) *
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
  
  // Enhanced Trip Plan Synthesis
  async synthesizeEnhancedTripPlan(agentResults, criteria) {
    const plan = { ...this.tripSchema };
    
    this.logInfo('Synthesizing enhanced trip plan...');
    
    // Populate recommendations from each agent
    const successfulAgents = agentResults.filter(r => r.success);
    const failedAgents = agentResults.filter(r => !r.success);
    
    this.logInfo(`Successful agents: ${successfulAgents.length}, Failed agents: ${failedAgents.length}`);
    
    successfulAgents.forEach(result => {
      if (result.data?.content?.recommendations) {
        plan.recommendations[result.name] = result.data.content.recommendations;
      }
    });

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
    
    this.logInfo(`Generating ${days}-day enhanced itinerary...`);
    
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
  
  generateDayNotes(dayIndex, totalDays, activities) {
    if (dayIndex === 0) return 'Arrival day - lighter activities recommended';
    if (dayIndex === totalDays - 1) return 'Departure day - plan activities near hotel/airport';
    if (activities.length > 2) return 'Full day - allow extra time for transportation';
    return '';
  }

  // Enhanced Final Recommendations with AI Synthesis
  async generateEnhancedRecommendations(tripPlan, criteria) {
    this.logInfo('Generating enhanced final recommendations with AI synthesis...');
    
    const prompt = `
Analyze this comprehensive trip plan and provide enhanced recommendations:

Trip Context:
- Destination: ${criteria.destination}
- Dates: ${criteria.departureDate} to ${criteria.returnDate}
- Travelers: ${criteria.travelers}
- Geographic Coverage: ${tripPlan.tripSummary.geographicCoverage}%

Recommendation Summary:
${Object.entries(tripPlan.recommendations).map(([type, recs]) => 
  `${type}: ${recs?.length || 0} options`).join('\
')}

Geographic Clusters:
${JSON.stringify(tripPlan.metadata.geographicAnalysis?.clusters || [], null, 2)}

Please provide:
1. Overall trip confidence score (0-100) based on recommendation quality and geographic efficiency
2. Top insights about the trip plan
3. Optimization suggestions for logistics and pacing
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
      
      this.logInfo(`Final trip confidence: ${finalPlan.tripSummary.confidence}%`);
      return finalPlan;
      
    } catch (error) {
      this.logError('AI synthesis failed, calculating basic confidence:', error.message);
      
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
    this.logInfo('Validating trip feasibility using GeographicService...');
    
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
