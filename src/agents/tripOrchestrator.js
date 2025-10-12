import { BaseAgent } from './baseAgent.js';
import { FlightAgent } from './flightAgent.js';
import { AccommodationAgent } from './accommodationAgent.js';
import { ActivityAgent } from './activityAgent.js';
import { RestaurantAgent } from './restaurantAgent.js';
import { TransportationAgent } from './transportationAgent.js';
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
      restaurant: new RestaurantAgent(aiConfig),
      transportation: new TransportationAgent(aiConfig)
    };

    // Define execution phases with dependencies
    this.executionPhases = [
      {
        phase: 'independent',
        agents: ['flight', 'accommodation'],
        parallel: true,
        description: 'Independent agents - flights and hotels'
      },
      {
        phase: 'location_dependent', 
        agents: ['activity'],
        parallel: false,
        dependencies: ['accommodation'],
        description: 'Activities based on hotel location'
      },
      {
        phase: 'activity_dependent',
        agents: ['restaurant'], 
        parallel: false,
        dependencies: ['activity'],
        description: 'Restaurants based on activity locations'
      },
      {
        phase: 'validation',
        agents: ['transportation'],
        parallel: false,
        dependencies: ['accommodation', 'activity', 'restaurant'],
        description: 'Transportation validation of entire plan'
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
        restaurant: [],
        transportation: []
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
      
      // Execute agents in smart dependency order
      const agentResults = await this.executeAgentsWithDependencies(criteria);
      
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
      
      // Update trip status to completed
      await this.updateTripStatus('completed', { 
        completedAt: new Date(),
        totalDuration: executionTime
      });
      
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

  async storeRecommendations(agentName, recommendations) {
    if (!this.tripId || !recommendations || recommendations.length === 0) return [];
    
    try {
      const recommendationIds = [];
      
      for (const rec of recommendations) {
        const recommendation = await Recommendation.create({
          agentType: agentName,
          name: rec.name || rec.title || 'Unknown',
          description: rec.description || rec.summary || '',
          price: {
            amount: rec.price || rec.cost || 0,
            currency: 'USD',
            priceType: this.getPriceType(agentName)
          },
          rating: {
            score: rec.rating || rec.score || 0,
            reviewCount: rec.reviewCount || 0,
            source: rec.source || agentName
          },
          location: {
            address: rec.address || rec.location,
            city: this.trip?.destination?.name || 'Unknown',
            coordinates: rec.coordinates || rec.location?.coordinates
          },
          confidence: {
            score: rec.confidence || this.calculateRecommendationConfidence(rec),
            reasoning: rec.reasoning || `Generated by ${agentName} agent`
          },
          agentMetadata: rec,
          externalIds: {
            providerId: rec.id || rec.providerId
          },
          images: rec.images || []
        });
        
        recommendationIds.push(recommendation._id);
      }
      
      // Update trip with new recommendations
      await Trip.findByIdAndUpdate(this.tripId, {
        [`recommendations.${agentName}`]: recommendationIds,
        [`agentExecution.agents.${agentName}.recommendationCount`]: recommendationIds.length
      });
      
      return recommendationIds;
    } catch (error) {
      console.error(`Failed to store ${agentName} recommendations:`, error);
      return [];
    }
  }

  getPriceType(agentName) {
    const priceTypes = {
      flight: 'per_person',
      accommodation: 'per_night', 
      activity: 'per_person',
      restaurant: 'per_person',
      transportation: 'per_group'
    };
    return priceTypes[agentName] || 'per_person';
  }

  calculateRecommendationConfidence(rec) {
    let confidence = 0.7; // Base confidence
    
    if (rec.rating && rec.rating > 4.0) confidence += 0.1;
    if (rec.reviewCount && rec.reviewCount > 100) confidence += 0.1;
    if (rec.price && rec.price > 0) confidence += 0.05;
    if (rec.coordinates) confidence += 0.05;
    
    return Math.min(confidence, 1.0);
  }

  // Enhanced Criteria Extraction
  extractCriteria(tripRequest) {
    // Budget is optional - only use if provided and greater than 0
    const hasBudget = tripRequest.budget && tripRequest.budget.total && tripRequest.budget.total > 0;

    const baseCriteria = {
      // Core trip details
      tripId: this.tripId,
      origin: tripRequest.origin,
      destination: tripRequest.destination,
      departureDate: tripRequest.departureDate,
      returnDate: tripRequest.returnDate,
      travelers: tripRequest.travelers || 1,

      // Budget information (optional - 0 means no budget limit)
      totalBudget: hasBudget ? tripRequest.budget.total : undefined,
      budgetBreakdown: hasBudget ? tripRequest.budget : {},

      // Flight criteria (don't set maxPrice if budget is 0 or undefined)
      maxPrice: (tripRequest.budget?.flight && tripRequest.budget.flight > 0) ? tripRequest.budget.flight : undefined,
      preferNonStop: tripRequest.preferences?.nonStopFlights,
      preferredClass: tripRequest.preferences?.flightClass,

      // Accommodation criteria (don't set maxPrice if budget is 0 or undefined)
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

      // Transportation criteria (don't set maxCost if budget is 0 or undefined)
      transportTypes: tripRequest.preferences?.transportModes || ['rideshare', 'public'],
      maxCost: (tripRequest.budget?.transportation && tripRequest.budget.transportation > 0) ? tripRequest.budget.transportation : undefined,
      minCapacity: tripRequest.travelers || 1,

      // Context for dependent agents
      executionContext: this.executionContext
    };

    console.log('📊 Extracted criteria - Budget handling:', {
      hasBudget,
      totalBudget: baseCriteria.totalBudget,
      flightMaxPrice: baseCriteria.maxPrice,
      transportMaxCost: baseCriteria.maxCost
    });

    return baseCriteria;
  }

  initializeBudgetTracking(criteria) {
    this.executionContext.budgetTracking = {
      allocated: {
        flight: criteria.budgetBreakdown.flight || 0,
        accommodation: criteria.budgetBreakdown.accommodation || 0,
        activity: criteria.budgetBreakdown.activity || 0,
        restaurant: criteria.budgetBreakdown.restaurant || 0,
        transportation: criteria.budgetBreakdown.transportation || 0
      },
      spent: {
        flight: 0,
        accommodation: 0,
        activity: 0,
        restaurant: 0,
        transportation: 0
      },
      remaining: { ...criteria.budgetBreakdown },
      totalAllocated: criteria.totalBudget || 0
    };
  }

  // Smart Agent Execution with Dependencies
  async executeAgentsWithDependencies(criteria) {
    const allResults = [];
    const executedAgents = new Set();
    
    console.log('Starting smart agent execution with dependencies...');
    
    for (const phase of this.executionPhases) {
      console.log(`\
Executing phase: ${phase.description}`);
      
      // Check if dependencies are met
      if (phase.dependencies) {
        const missingDeps = phase.dependencies.filter(dep => !executedAgents.has(dep));
        if (missingDeps.length > 0) {
          console.warn(`Phase ${phase.phase} missing dependencies: ${missingDeps.join(', ')}`);
          continue;
        }
      }
      
      if (phase.parallel) {
        // Execute agents in parallel
        const phaseResults = await this.executeAgentsParallel(phase.agents, criteria);
        allResults.push(...phaseResults);
      } else {
        // Execute agents sequentially
        const phaseResults = await this.executeAgentsSequential(phase.agents, criteria);
        allResults.push(...phaseResults);
      }
      
      // Mark agents as executed and update context
      for (const agentName of phase.agents) {
        executedAgents.add(agentName);
        const agentResult = allResults.find(r => r.name === agentName);
        
        if (agentResult && agentResult.success) {
          await this.updateExecutionContext(agentName, agentResult);
        }
      }
    }
    
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
        // Store recommendations in database
        const recommendations = result.data?.content?.recommendations || [];
        const storedIds = await this.storeRecommendations(agentName, recommendations);
        
        // Calculate confidence
        const confidence = this.calculateAgentConfidence(agentName, recommendations);
        
        await this.updateAgentStatus(agentName, 'completed', {
          completedAt: new Date(),
          duration,
          confidence,
          recommendationCount: recommendations.length
        });
        
        console.log(`  ✅ ${agentName} completed: ${recommendations.length} recommendations (${duration}ms)`);
        
        return { name: agentName, ...result, storedIds, confidence, duration };
      } else {
        await this.updateAgentStatus(agentName, 'failed', {
          completedAt: new Date(),
          duration,
          errors: [{ message: result.error, timestamp: new Date() }]
        });
        
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
        
      case 'transportation':
        // Validate entire trip feasibility
        enhanced.hotelLocation = this.executionContext.hotelLocation;
        enhanced.activityLocations = this.executionContext.selectedActivities;
        enhanced.restaurantLocations = [];
        enhanced.validateFeasibility = true;
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
    if (!recommendations || recommendations.length === 0) return;
    
    const totalSpent = recommendations.reduce((sum, rec) => {
      return sum + (rec.price || rec.cost || 0);
    }, 0);
    
    this.executionContext.budgetTracking.spent[agentName] = totalSpent;
    
    const allocated = this.executionContext.budgetTracking.allocated[agentName] || 0;
    this.executionContext.budgetTracking.remaining[agentName] = Math.max(0, allocated - totalSpent);
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
      case 'transportation':
        return (topRec.estimatedCost || topRec.price || 0) * 2; // Round trip
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
      restaurant: 'low - dining options available elsewhere',
      transportation: 'moderate - may affect trip efficiency'
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
    
    // Agent weights based on importance
    const agentWeights = {
      flight: 0.25,
      accommodation: 0.25,
      activity: 0.20,
      restaurant: 0.15,
      transportation: 0.15
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