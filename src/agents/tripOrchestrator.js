import { BaseAgent } from './baseAgent.js';
import { FlightAgent } from './flightAgent.js';
import { AccommodationAgent } from './accommodationAgent.js';
import { ActivityAgent } from './activityAgent.js';
import { RestaurantAgent } from './restaurantAgent.js';
import { TransportationAgent } from './transportationAgent.js';
import { Trip, Recommendation } from '../models/index.js';
import databaseService from '../services/database.js';

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
  async loadTripFromDatabase() {\n    if (!this.tripId) return;\n    \n    try {\n      await databaseService.connect();\n      this.trip = await Trip.findById(this.tripId);\n      \n      if (this.trip) {\n        console.log(`Loaded trip ${this.trip.tripId} from database`);\n      }\n    } catch (error) {\n      console.error('Failed to load trip from database:', error);\n    }\n  }\n\n  async updateTripStatus(status, metadata = {}) {\n    if (!this.tripId) return;\n    \n    try {\n      const updateData = {\n        'agentExecution.status': status,\n        ...Object.entries(metadata).reduce((acc, [key, value]) => {\n          acc[`agentExecution.${key}`] = value;\n          return acc;\n        }, {})\n      };\n      \n      await Trip.findByIdAndUpdate(this.tripId, updateData);\n      console.log(`Updated trip ${this.tripId} status to: ${status}`);\n    } catch (error) {\n      console.error('Failed to update trip status:', error);\n    }\n  }\n\n  async updateAgentStatus(agentName, status, metadata = {}) {\n    if (!this.tripId) return;\n    \n    try {\n      const updateData = {\n        [`agentExecution.agents.${agentName}.status`]: status,\n        ...Object.entries(metadata).reduce((acc, [key, value]) => {\n          acc[`agentExecution.agents.${agentName}.${key}`] = value;\n          return acc;\n        }, {})\n      };\n      \n      await Trip.findByIdAndUpdate(this.tripId, updateData);\n    } catch (error) {\n      console.error(`Failed to update ${agentName} agent status:`, error);\n    }\n  }\n\n  async storeRecommendations(agentName, recommendations) {\n    if (!this.tripId || !recommendations || recommendations.length === 0) return [];\n    \n    try {\n      const recommendationIds = [];\n      \n      for (const rec of recommendations) {\n        const recommendation = await Recommendation.create({\n          agentType: agentName,\n          name: rec.name || rec.title || 'Unknown',\n          description: rec.description || rec.summary || '',\n          price: {\n            amount: rec.price || rec.cost || 0,\n            currency: 'USD',\n            priceType: this.getPriceType(agentName)\n          },\n          rating: {\n            score: rec.rating || rec.score || 0,\n            reviewCount: rec.reviewCount || 0,\n            source: rec.source || agentName\n          },\n          location: {\n            address: rec.address || rec.location,\n            city: this.trip?.destination?.name || 'Unknown',\n            coordinates: rec.coordinates || rec.location?.coordinates\n          },\n          confidence: {\n            score: rec.confidence || this.calculateRecommendationConfidence(rec),\n            reasoning: rec.reasoning || `Generated by ${agentName} agent`\n          },\n          agentMetadata: rec,\n          externalIds: {\n            providerId: rec.id || rec.providerId\n          },\n          images: rec.images || []\n        });\n        \n        recommendationIds.push(recommendation._id);\n      }\n      \n      // Update trip with new recommendations\n      await Trip.findByIdAndUpdate(this.tripId, {\n        [`recommendations.${agentName}`]: recommendationIds,\n        [`agentExecution.agents.${agentName}.recommendationCount`]: recommendationIds.length\n      });\n      \n      return recommendationIds;\n    } catch (error) {\n      console.error(`Failed to store ${agentName} recommendations:`, error);\n      return [];\n    }\n  }\n\n  getPriceType(agentName) {\n    const priceTypes = {\n      flight: 'per_person',\n      accommodation: 'per_night', \n      activity: 'per_person',\n      restaurant: 'per_person',\n      transportation: 'per_group'\n    };\n    return priceTypes[agentName] || 'per_person';\n  }\n\n  calculateRecommendationConfidence(rec) {\n    let confidence = 0.7; // Base confidence\n    \n    if (rec.rating && rec.rating > 4.0) confidence += 0.1;\n    if (rec.reviewCount && rec.reviewCount > 100) confidence += 0.1;\n    if (rec.price && rec.price > 0) confidence += 0.05;\n    if (rec.coordinates) confidence += 0.05;\n    \n    return Math.min(confidence, 1.0);\n  }\n\n  // Enhanced Criteria Extraction\n  extractCriteria(tripRequest) {\n    const baseCriteria = {\n      // Core trip details\n      tripId: this.tripId,\n      origin: tripRequest.origin,\n      destination: tripRequest.destination,\n      departureDate: tripRequest.departureDate,\n      returnDate: tripRequest.returnDate,\n      travelers: tripRequest.travelers || 1,\n      \n      // Budget information\n      totalBudget: tripRequest.budget?.total || 0,\n      budgetBreakdown: tripRequest.budget || {},\n      \n      // Flight criteria\n      maxPrice: tripRequest.budget?.flight,\n      preferNonStop: tripRequest.preferences?.nonStopFlights,\n      preferredClass: tripRequest.preferences?.flightClass,\n\n      // Accommodation criteria\n      checkInDate: tripRequest.departureDate,\n      checkOutDate: tripRequest.returnDate,\n      accommodationType: tripRequest.preferences?.accommodationType,\n      minRating: tripRequest.preferences?.minRating || 4.0,\n      requiredAmenities: tripRequest.preferences?.amenities,\n\n      // Activity criteria\n      categories: tripRequest.interests || ['cultural', 'food'],\n      difficulty: tripRequest.preferences?.activityLevel || 'easy',\n      duration: tripRequest.preferences?.activityDuration,\n\n      // Restaurant criteria\n      cuisines: tripRequest.preferences?.cuisines,\n      priceRange: tripRequest.preferences?.diningBudget || '$$',\n      features: tripRequest.preferences?.restaurantFeatures,\n\n      // Transportation criteria\n      transportTypes: tripRequest.preferences?.transportModes || ['rideshare', 'public'],\n      maxCost: tripRequest.budget?.transportation,\n      minCapacity: tripRequest.travelers || 1,\n      \n      // Context for dependent agents\n      executionContext: this.executionContext\n    };\n    \n    return baseCriteria;\n  }\n\n  initializeBudgetTracking(criteria) {\n    this.executionContext.budgetTracking = {\n      allocated: {\n        flight: criteria.budgetBreakdown.flight || 0,\n        accommodation: criteria.budgetBreakdown.accommodation || 0,\n        activity: criteria.budgetBreakdown.activity || 0,\n        restaurant: criteria.budgetBreakdown.restaurant || 0,\n        transportation: criteria.budgetBreakdown.transportation || 0\n      },\n      spent: {\n        flight: 0,\n        accommodation: 0,\n        activity: 0,\n        restaurant: 0,\n        transportation: 0\n      },\n      remaining: { ...criteria.budgetBreakdown },\n      totalAllocated: criteria.totalBudget || 0\n    };\n  }"}

  // Smart Agent Execution with Dependencies\n  async executeAgentsWithDependencies(criteria) {\n    const allResults = [];\n    const executedAgents = new Set();\n    \n    console.log('Starting smart agent execution with dependencies...');\n    \n    for (const phase of this.executionPhases) {\n      console.log(`\\nExecuting phase: ${phase.description}`);\n      \n      // Check if dependencies are met\n      if (phase.dependencies) {\n        const missingDeps = phase.dependencies.filter(dep => !executedAgents.has(dep));\n        if (missingDeps.length > 0) {\n          console.warn(`Phase ${phase.phase} missing dependencies: ${missingDeps.join(', ')}`);\n          continue;\n        }\n      }\n      \n      if (phase.parallel) {\n        // Execute agents in parallel\n        const phaseResults = await this.executeAgentsParallel(phase.agents, criteria);\n        allResults.push(...phaseResults);\n      } else {\n        // Execute agents sequentially\n        const phaseResults = await this.executeAgentsSequential(phase.agents, criteria);\n        allResults.push(...phaseResults);\n      }\n      \n      // Mark agents as executed and update context\n      for (const agentName of phase.agents) {\n        executedAgents.add(agentName);\n        const agentResult = allResults.find(r => r.name === agentName);\n        \n        if (agentResult && agentResult.success) {\n          await this.updateExecutionContext(agentName, agentResult);\n        }\n      }\n    }\n    \n    return allResults;\n  }\n  \n  async executeAgentsParallel(agentNames, criteria) {\n    const promises = agentNames.map(async (agentName) => {\n      return await this.executeAgent(agentName, criteria);\n    });\n    \n    return await Promise.all(promises);\n  }\n  \n  async executeAgentsSequential(agentNames, criteria) {\n    const results = [];\n    \n    for (const agentName of agentNames) {\n      const result = await this.executeAgent(agentName, criteria);\n      results.push(result);\n      \n      // Update context immediately for next agent\n      if (result.success) {\n        await this.updateExecutionContext(agentName, result);\n        // Update criteria with new context for next agent\n        criteria.executionContext = this.executionContext;\n      }\n    }\n    \n    return results;\n  }\n  \n  async executeAgent(agentName, criteria) {\n    const agent = this.agents[agentName];\n    const startTime = Date.now();\n    \n    try {\n      console.log(`  Executing ${agentName} agent...`);\n      await this.updateAgentStatus(agentName, 'running', { startedAt: new Date() });\n      \n      // Enhance criteria with context for dependent agents\n      const enhancedCriteria = this.enhanceCriteriaForAgent(agentName, criteria);\n      \n      const result = await agent.execute({ criteria: enhancedCriteria });\n      const duration = Date.now() - startTime;\n      \n      if (result.success) {\n        // Store recommendations in database\n        const recommendations = result.data?.content?.recommendations || [];\n        const storedIds = await this.storeRecommendations(agentName, recommendations);\n        \n        // Calculate confidence\n        const confidence = this.calculateAgentConfidence(agentName, recommendations);\n        \n        await this.updateAgentStatus(agentName, 'completed', {\n          completedAt: new Date(),\n          duration,\n          confidence,\n          recommendationCount: recommendations.length\n        });\n        \n        console.log(`  ✅ ${agentName} completed: ${recommendations.length} recommendations (${duration}ms)`);\n        \n        return { name: agentName, ...result, storedIds, confidence, duration };\n      } else {\n        await this.updateAgentStatus(agentName, 'failed', {\n          completedAt: new Date(),\n          duration,\n          errors: [{ message: result.error, timestamp: new Date() }]\n        });\n        \n        console.log(`  ❌ ${agentName} failed: ${result.error} (${duration}ms)`);\n        \n        return { name: agentName, ...result, duration };\n      }\n      \n    } catch (error) {\n      const duration = Date.now() - startTime;\n      \n      await this.updateAgentStatus(agentName, 'failed', {\n        completedAt: new Date(),\n        duration,\n        errors: [{ message: error.message, timestamp: new Date(), stack: error.stack }]\n      });\n      \n      console.log(`  💥 ${agentName} crashed: ${error.message} (${duration}ms)`);\n      \n      return {\n        name: agentName,\n        success: false,\n        error: error.message,\n        duration,\n        executedAt: new Date().toISOString()\n      };\n    }\n  }\n  \n  enhanceCriteriaForAgent(agentName, baseCriteria) {\n    const enhanced = { ...baseCriteria };\n    \n    switch (agentName) {\n      case 'activity':\n        // Use hotel location for geographic clustering\n        if (this.executionContext.hotelLocation) {\n          enhanced.preferredArea = this.executionContext.hotelLocation;\n          enhanced.maxDistanceFromHotel = 10; // km\n          enhanced.geographicContext = this.executionContext.geographicClusters;\n        }\n        break;\n        \n      case 'restaurant':\n        // Use activity locations and hotel location\n        if (this.executionContext.selectedActivities.length > 0) {\n          enhanced.activityLocations = this.executionContext.selectedActivities;\n          enhanced.preferredAreas = this.executionContext.geographicClusters;\n        }\n        if (this.executionContext.hotelLocation) {\n          enhanced.hotelLocation = this.executionContext.hotelLocation;\n        }\n        break;\n        \n      case 'transportation':\n        // Validate entire trip feasibility\n        enhanced.hotelLocation = this.executionContext.hotelLocation;\n        enhanced.activityLocations = this.executionContext.selectedActivities;\n        enhanced.restaurantLocations = [];\n        enhanced.validateFeasibility = true;\n        break;\n    }\n    \n    return enhanced;\n  }\n  \n  async updateExecutionContext(agentName, result) {\n    const recommendations = result.data?.content?.recommendations || [];\n    \n    switch (agentName) {\n      case 'accommodation':\n        // Extract hotel location for geographic clustering\n        if (recommendations.length > 0) {\n          const bestHotel = recommendations[0];\n          if (bestHotel.coordinates || bestHotel.location) {\n            this.executionContext.hotelLocation = {\n              name: bestHotel.name,\n              coordinates: bestHotel.coordinates || bestHotel.location.coordinates,\n              address: bestHotel.address || bestHotel.location\n            };\n            \n            console.log(`  📍 Hotel location set: ${bestHotel.name}`);\n          }\n        }\n        break;\n        \n      case 'activity':\n        // Store activity locations for restaurant clustering\n        this.executionContext.selectedActivities = recommendations.map(activity => ({\n          name: activity.name,\n          coordinates: activity.coordinates || activity.location?.coordinates,\n          address: activity.address || activity.location,\n          category: activity.category\n        })).filter(a => a.coordinates);\n        \n        // Create geographic clusters\n        this.executionContext.geographicClusters = this.createGeographicClusters([\n          this.executionContext.hotelLocation,\n          ...this.executionContext.selectedActivities\n        ].filter(Boolean));\n        \n        console.log(`  🗺️  Geographic clusters created: ${this.executionContext.geographicClusters.length}`);\n        break;\n    }\n    \n    // Update budget tracking\n    this.updateBudgetTracking(agentName, recommendations);\n  }\n  \n  createGeographicClusters(locations) {\n    if (locations.length < 2) return [];\n    \n    const clusters = [];\n    const maxDistance = 2; // km for clustering\n    \n    for (const location of locations) {\n      let addedToCluster = false;\n      \n      for (const cluster of clusters) {\n        const clusterCenter = this.calculateClusterCenter(cluster.locations);\n        const distance = this.calculateDistance(\n          location.coordinates,\n          clusterCenter\n        );\n        \n        if (distance <= maxDistance) {\n          cluster.locations.push(location);\n          addedToCluster = true;\n          break;\n        }\n      }\n      \n      if (!addedToCluster) {\n        clusters.push({\n          id: `cluster_${clusters.length + 1}`,\n          locations: [location],\n          center: location.coordinates\n        });\n      }\n    }\n    \n    return clusters;\n  }\n  \n  calculateClusterCenter(locations) {\n    if (locations.length === 0) return null;\n    \n    const avgLat = locations.reduce((sum, loc) => sum + (loc.coordinates?.latitude || 0), 0) / locations.length;\n    const avgLng = locations.reduce((sum, loc) => sum + (loc.coordinates?.longitude || 0), 0) / locations.length;\n    \n    return { latitude: avgLat, longitude: avgLng };\n  }\n  \n  calculateDistance(coord1, coord2) {\n    if (!coord1 || !coord2) return Infinity;\n    \n    const R = 6371; // Earth's radius in km\n    const dLat = this.toRadians(coord2.latitude - coord1.latitude);\n    const dLon = this.toRadians(coord2.longitude - coord1.longitude);\n    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +\n        Math.cos(this.toRadians(coord1.latitude)) * Math.cos(this.toRadians(coord2.latitude)) *\n        Math.sin(dLon/2) * Math.sin(dLon/2);\n    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));\n    return R * c;\n  }\n  \n  toRadians(degrees) {\n    return degrees * (Math.PI / 180);\n  }\n  \n  calculateAgentConfidence(agentName, recommendations) {\n    if (!recommendations || recommendations.length === 0) return 0;\n    \n    const scores = recommendations.map(rec => rec.confidence || this.calculateRecommendationConfidence(rec));\n    return scores.reduce((sum, score) => sum + score, 0) / scores.length;\n  }\n  \n  updateBudgetTracking(agentName, recommendations) {\n    if (!recommendations || recommendations.length === 0) return;\n    \n    const totalSpent = recommendations.reduce((sum, rec) => {\n      return sum + (rec.price || rec.cost || 0);\n    }, 0);\n    \n    this.executionContext.budgetTracking.spent[agentName] = totalSpent;\n    \n    const allocated = this.executionContext.budgetTracking.allocated[agentName] || 0;\n    this.executionContext.budgetTracking.remaining[agentName] = Math.max(0, allocated - totalSpent);\n  }"}

  // Enhanced Trip Plan Synthesis\n  async synthesizeEnhancedTripPlan(agentResults, criteria) {\n    const plan = { ...this.tripSchema };\n    \n    console.log('Synthesizing enhanced trip plan...');\n    \n    // Populate recommendations from each agent\n    const successfulAgents = agentResults.filter(r => r.success);\n    const failedAgents = agentResults.filter(r => !r.success);\n    \n    console.log(`Successful agents: ${successfulAgents.length}, Failed agents: ${failedAgents.length}`);\n    \n    successfulAgents.forEach(result => {\n      if (result.data?.content?.recommendations) {\n        plan.recommendations[result.name] = result.data.content.recommendations;\n      }\n    });\n\n    // Enhanced budget analysis with actual vs allocated\n    plan.tripSummary.budget = this.calculateEnhancedBudget(plan.recommendations, criteria);\n    plan.tripSummary.destination = criteria.destination;\n    plan.tripSummary.dates = {\n      departure: criteria.departureDate,\n      return: criteria.returnDate\n    };\n    \n    // Geographic coverage analysis\n    plan.tripSummary.geographicCoverage = this.calculateGeographicCoverage();\n\n    // Enhanced itinerary with geographic clustering\n    plan.itinerary = await this.generateEnhancedItinerary(plan.recommendations, criteria);\n    \n    // Budget validation and warnings\n    plan.metadata.budgetValidation = this.validateBudgetConstraints(criteria);\n    \n    // Geographic analysis\n    plan.metadata.geographicAnalysis = {\n      clusters: this.executionContext.geographicClusters,\n      hotelLocation: this.executionContext.hotelLocation,\n      coverage: plan.tripSummary.geographicCoverage\n    };\n    \n    // Failed agents handling\n    if (failedAgents.length > 0) {\n      plan.metadata.failedAgents = failedAgents.map(agent => ({\n        name: agent.name,\n        error: agent.error,\n        impact: this.assessAgentFailureImpact(agent.name)\n      }));\n    }\n\n    return plan;\n  }\n  \n  calculateEnhancedBudget(recommendations, criteria) {\n    const breakdown = {};\n    let total = 0;\n    const tracking = this.executionContext.budgetTracking;\n    \n    // Calculate actual costs from recommendations\n    Object.entries(recommendations).forEach(([category, recs]) => {\n      if (recs && recs.length > 0) {\n        const categoryTotal = this.calculateCategoryBudget(category, recs, criteria);\n        breakdown[category] = {\n          estimated: categoryTotal,\n          allocated: tracking.allocated[category] || 0,\n          variance: categoryTotal - (tracking.allocated[category] || 0),\n          recommendations: recs.length\n        };\n        total += categoryTotal;\n      }\n    });\n    \n    return {\n      total,\n      allocated: tracking.totalAllocated,\n      variance: total - tracking.totalAllocated,\n      breakdown,\n      analysis: this.generateBudgetAnalysis(breakdown, criteria)\n    };\n  }\n  \n  calculateCategoryBudget(category, recommendations, criteria) {\n    const topRec = recommendations[0];\n    if (!topRec) return 0;\n    \n    switch (category) {\n      case 'flight':\n        return (topRec.price || 0) * (criteria.travelers || 1);\n      case 'accommodation':\n        const nights = this.calculateNights(criteria.departureDate, criteria.returnDate);\n        return (topRec.price || 0) * nights;\n      case 'activity':\n        return recommendations.slice(0, 3).reduce((sum, activity) => \n          sum + ((activity.price || 0) * (criteria.travelers || 1)), 0);\n      case 'restaurant':\n        return recommendations.slice(0, 3).reduce((sum, restaurant) => \n          sum + ((restaurant.averageMeal || restaurant.price || 0) * (criteria.travelers || 1)), 0);\n      case 'transportation':\n        return (topRec.estimatedCost || topRec.price || 0) * 2; // Round trip\n      default:\n        return topRec.price || 0;\n    }\n  }\n  \n  calculateNights(departureDate, returnDate) {\n    if (!returnDate) return 1;\n    const departure = new Date(departureDate);\n    const returnD = new Date(returnDate);\n    return Math.max(1, Math.ceil((returnD - departure) / (1000 * 60 * 60 * 24)));\n  }\n  \n  calculateGeographicCoverage() {\n    const clusters = this.executionContext.geographicClusters;\n    if (clusters.length === 0) return 0;\n    \n    const totalLocations = this.executionContext.selectedActivities.length + \n                          (this.executionContext.hotelLocation ? 1 : 0);\n    \n    if (totalLocations === 0) return 0;\n    \n    // Calculate spread efficiency (fewer clusters = better geographic efficiency)\n    const efficiency = Math.max(0, 1 - (clusters.length - 1) / totalLocations);\n    return Math.round(efficiency * 100);\n  }\n  \n  validateBudgetConstraints(criteria) {\n    const tracking = this.executionContext.budgetTracking;\n    const warnings = [];\n    const recommendations = [];\n    \n    Object.entries(tracking.spent).forEach(([category, spent]) => {\n      const allocated = tracking.allocated[category] || 0;\n      \n      if (allocated > 0) {\n        const variance = spent - allocated;\n        const percentOver = (variance / allocated) * 100;\n        \n        if (percentOver > 20) {\n          warnings.push(`${category} budget exceeded by ${percentOver.toFixed(1)}%`);\n          recommendations.push(`Consider reducing ${category} selections or increasing budget`);\n        } else if (percentOver > 10) {\n          warnings.push(`${category} budget over by ${percentOver.toFixed(1)}%`);\n        }\n      }\n    });\n    \n    return {\n      isWithinBudget: warnings.length === 0,\n      warnings,\n      recommendations,\n      totalVariance: tracking.spent - tracking.totalAllocated\n    };\n  }\n  \n  generateBudgetAnalysis(breakdown, criteria) {\n    const insights = [];\n    const totalBudget = criteria.totalBudget || 0;\n    \n    if (totalBudget > 0) {\n      Object.entries(breakdown).forEach(([category, data]) => {\n        const percentage = (data.estimated / totalBudget) * 100;\n        \n        if (percentage > 40) {\n          insights.push(`${category} represents ${percentage.toFixed(1)}% of total budget - consider optimizing`);\n        }\n      });\n    }\n    \n    return {\n      insights,\n      recommendedAdjustments: this.generateBudgetRecommendations(breakdown)\n    };\n  }\n  \n  generateBudgetRecommendations(breakdown) {\n    const recs = [];\n    \n    Object.entries(breakdown).forEach(([category, data]) => {\n      if (data.variance > 0 && data.allocated > 0) {\n        const overBy = (data.variance / data.allocated) * 100;\n        if (overBy > 15) {\n          recs.push(`Consider budget-friendly ${category} alternatives or increase allocation by $${data.variance}`);\n        }\n      }\n    });\n    \n    return recs;\n  }\n  \n  assessAgentFailureImpact(agentName) {\n    const impacts = {\n      flight: 'critical - trip cannot proceed without flights',\n      accommodation: 'critical - lodging required for trip',\n      activity: 'moderate - reduces trip experience but not essential',\n      restaurant: 'low - dining options available elsewhere',\n      transportation: 'moderate - may affect trip efficiency'\n    };\n    \n    return impacts[agentName] || 'unknown impact';\n  }\n  \n  async generateEnhancedItinerary(recommendations, criteria) {\n    const itinerary = [];\n    const startDate = new Date(criteria.departureDate);\n    const endDate = new Date(criteria.returnDate || criteria.departureDate);\n    const days = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));\n    \n    console.log(`Generating ${days}-day enhanced itinerary...`);\n    \n    const activities = recommendations.activity || [];\n    const restaurants = recommendations.restaurant || [];\n    const clusters = this.executionContext.geographicClusters;\n    \n    for (let i = 0; i < days; i++) {\n      const date = new Date(startDate);\n      date.setDate(date.getDate() + i);\n      \n      const dayActivities = this.selectActivitiesForDay(activities, i, clusters);\n      const dayRestaurants = this.selectRestaurantsForDay(restaurants, dayActivities, i, clusters);\n      \n      itinerary.push({\n        date: date.toISOString().split('T')[0],\n        day: i + 1,\n        activities: dayActivities,\n        restaurants: dayRestaurants,\n        geographicCluster: clusters[i % clusters.length]?.id || null,\n        estimatedBudget: this.calculateDayBudget(dayActivities, dayRestaurants),\n        notes: this.generateDayNotes(i, days, dayActivities)\n      });\n    }\n    \n    return itinerary;\n  }\n  \n  selectActivitiesForDay(activities, dayIndex, clusters) {\n    if (!activities || activities.length === 0) return [];\n    \n    // Distribute activities across days, prioritizing by cluster if available\n    const activitiesPerDay = Math.ceil(activities.length / Math.max(1, clusters.length));\n    const startIndex = dayIndex * activitiesPerDay;\n    \n    return activities.slice(startIndex, startIndex + activitiesPerDay);\n  }\n  \n  selectRestaurantsForDay(restaurants, dayActivities, dayIndex, clusters) {\n    if (!restaurants || restaurants.length === 0) return [];\n    \n    // Select 1-2 restaurants per day, preferring those near activities\n    const dayRestaurants = [];\n    \n    if (dayIndex < restaurants.length) {\n      dayRestaurants.push(restaurants[dayIndex]);\n    }\n    \n    // Add second restaurant if available and it's not the last day\n    if (restaurants.length > dayIndex + 1 && dayActivities.length > 1) {\n      const secondIndex = (dayIndex + Math.floor(restaurants.length / 2)) % restaurants.length;\n      if (secondIndex !== dayIndex) {\n        dayRestaurants.push(restaurants[secondIndex]);\n      }\n    }\n    \n    return dayRestaurants;\n  }\n  \n  calculateDayBudget(activities, restaurants) {\n    const activityCost = activities.reduce((sum, activity) => sum + (activity.price || 0), 0);\n    const restaurantCost = restaurants.reduce((sum, restaurant) => sum + (restaurant.averageMeal || restaurant.price || 0), 0);\n    \n    return activityCost + restaurantCost;\n  }\n  \n  generateDayNotes(dayIndex, totalDays, activities) {\n    if (dayIndex === 0) return 'Arrival day - lighter activities recommended';\n    if (dayIndex === totalDays - 1) return 'Departure day - plan activities near hotel/airport';\n    if (activities.length > 2) return 'Full day - allow extra time for transportation';\n    return '';\n  }"}

  // Enhanced Final Recommendations with AI Synthesis\n  async generateEnhancedRecommendations(tripPlan, criteria) {\n    console.log('Generating enhanced final recommendations with AI synthesis...');\n    \n    const prompt = `\nAnalyze this comprehensive trip plan and provide enhanced recommendations:\n\nTrip Context:\n- Destination: ${criteria.destination}\n- Dates: ${criteria.departureDate} to ${criteria.returnDate}\n- Travelers: ${criteria.travelers}\n- Budget Analysis: ${JSON.stringify(tripPlan.tripSummary.budget, null, 2)}\n- Geographic Coverage: ${tripPlan.tripSummary.geographicCoverage}%\n\nRecommendation Summary:\n${Object.entries(tripPlan.recommendations).map(([type, recs]) => \n  `${type}: ${recs?.length || 0} options`).join('\\n')}\n\nBudget Validation:\n${JSON.stringify(tripPlan.metadata.budgetValidation, null, 2)}\n\nGeographic Clusters:\n${JSON.stringify(tripPlan.metadata.geographicAnalysis?.clusters || [], null, 2)}\n\nPlease provide:\n1. Overall trip confidence score (0-100) based on recommendation quality and geographic efficiency\n2. Top insights about the trip plan\n3. Optimization suggestions for budget and logistics\n4. Risk assessment and mitigation strategies\n5. Alternative approaches for different preferences\n\nFocus on practical, actionable insights for the traveler.\n    `;\n\n    try {\n      const aiResponse = await this.generateStructuredResponse(prompt, {\n        overallConfidence: 0,\n        insights: [],\n        optimizations: [],\n        risks: [],\n        alternatives: []\n      });\n      \n      const finalPlan = {\n        ...tripPlan,\n        tripSummary: {\n          ...tripPlan.tripSummary,\n          confidence: aiResponse.content?.overallConfidence || this.calculateOverallConfidence(tripPlan)\n        },\n        metadata: {\n          ...tripPlan.metadata,\n          aiInsights: aiResponse.content?.insights || [],\n          optimizations: aiResponse.content?.optimizations || [],\n          riskAssessment: aiResponse.content?.risks || [],\n          alternatives: aiResponse.content?.alternatives || []\n        }\n      };\n      \n      console.log(`Final trip confidence: ${finalPlan.tripSummary.confidence}%`);\n      return finalPlan;\n      \n    } catch (error) {\n      console.error('AI synthesis failed, calculating basic confidence:', error.message);\n      \n      return {\n        ...tripPlan,\n        tripSummary: {\n          ...tripPlan.tripSummary,\n          confidence: this.calculateOverallConfidence(tripPlan)\n        },\n        metadata: {\n          ...tripPlan.metadata,\n          aiInsights: ['AI synthesis unavailable - using calculated confidence'],\n          synthesisError: error.message\n        }\n      };\n    }\n  }\n  \n  calculateOverallConfidence(tripPlan) {\n    let totalConfidence = 0;\n    let weightedScore = 0;\n    \n    // Agent weights based on importance\n    const agentWeights = {\n      flight: 0.25,\n      accommodation: 0.25,\n      activity: 0.20,\n      restaurant: 0.15,\n      transportation: 0.15\n    };\n    \n    Object.entries(tripPlan.recommendations).forEach(([agentType, recs]) => {\n      if (recs && recs.length > 0) {\n        const avgConfidence = recs.reduce((sum, rec) => \n          sum + (rec.confidence || 0.7), 0) / recs.length;\n        \n        const weight = agentWeights[agentType] || 0.1;\n        weightedScore += avgConfidence * weight;\n        totalConfidence += weight;\n      }\n    });\n    \n    const baseConfidence = totalConfidence > 0 ? (weightedScore / totalConfidence) : 0.5;\n    \n    // Apply bonuses/penalties\n    let finalConfidence = baseConfidence;\n    \n    // Geographic efficiency bonus\n    const geoEfficiency = tripPlan.tripSummary.geographicCoverage / 100;\n    finalConfidence += (geoEfficiency - 0.5) * 0.1;\n    \n    // Budget compliance bonus/penalty\n    const budgetValidation = tripPlan.metadata.budgetValidation;\n    if (budgetValidation?.isWithinBudget) {\n      finalConfidence += 0.05;\n    } else if (budgetValidation?.warnings?.length > 0) {\n      finalConfidence -= 0.1;\n    }\n    \n    // Failed agents penalty\n    const failedAgents = tripPlan.metadata.failedAgents || [];\n    finalConfidence -= failedAgents.length * 0.1;\n    \n    return Math.round(Math.max(0, Math.min(1, finalConfidence)) * 100);\n  }"}

  getAgentStatus() {
    return Object.entries(this.agents).map(([name, agent]) => ({
      name,
      status: agent.getStatus()
    }));
  }
}