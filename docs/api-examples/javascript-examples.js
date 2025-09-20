// JavaScript/Node.js API Examples for TravlrAPI
// These examples demonstrate how to integrate with all 6 MVP endpoints

const fetch = require('node-fetch'); // For Node.js, or use browser fetch

const API_BASE = 'http://localhost:3000';

// 1. Health Check Example
async function healthCheck() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    
    console.log('Health Status:', data.status);
    console.log('Database Connected:', data.database.isConnected);
    
    return data.status === 'OK';
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

// 2. Create Trip Example
async function createSampleTrip() {
  const tripData = {
    title: "Romantic Paris Getaway",
    destination: "Paris",
    origin: "New York",
    departureDate: "2025-12-15",
    returnDate: "2025-12-20",
    travelers: {
      count: 2,
      adults: 2,
      children: 0,
      infants: 0
    },
    preferences: {
      interests: ["cultural", "food", "art"],
      budget: {
        total: 3000,
        currency: "USD",
        breakdown: {
          flight: 1200,
          accommodation: 800,
          food: 600,
          activities: 400
        }
      },
      accommodation: {
        type: "hotel",
        minRating: 4,
        requiredAmenities: ["wifi", "restaurant"]
      },
      transportation: {
        flightClass: "economy",
        preferNonStop: true
      },
      dining: {
        dietaryRestrictions: ["vegetarian"],
        priceRange: "mid_range"
      }
    },
    collaboration: {
      createdBy: "demo_user"
    }
  };

  try {
    const response = await fetch(`${API_BASE}/api/trip/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(tripData)
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('Trip created successfully!');
      console.log('Trip ID:', result.data.tripId);
      console.log('Status:', result.data.status);
      
      return result.data.tripId;
    } else {
      console.error('Trip creation failed:', result.error);
      if (result.details) {
        console.log('Validation errors:', result.details);
      }
      return null;
    }
  } catch (error) {
    console.error('Error creating trip:', error);
    return null;
  }
}

// 3. Status Polling Example
class TripStatusMonitor {
  constructor(tripId) {
    this.tripId = tripId;
    this.polling = false;
    this.pollInterval = null;
  }

  async checkStatus() {
    try {
      const response = await fetch(`${API_BASE}/api/trip/${this.tripId}/status`);
      const result = await response.json();
      
      if (result.success) {
        const status = result.data;
        console.log(`\n--- Trip Status Update ---`);
        console.log(`Overall Status: ${status.status}`);
        console.log(`Execution Status: ${status.execution?.status || 'unknown'}`);
        
        if (status.execution?.agents) {
          console.log('Agent Progress:');
          Object.entries(status.execution.agents).forEach(([agent, agentStatus]) => {
            const emoji = agentStatus === 'completed' ? '✅' : 
                         agentStatus === 'running' ? '🔄' : 
                         agentStatus === 'failed' ? '❌' : '⏳';
            console.log(`  ${emoji} ${agent}: ${agentStatus}`);
          });
        }
        
        if (status.recommendationCounts) {
          const totalRecs = Object.values(status.recommendationCounts).reduce((a, b) => a + b, 0);
          console.log(`Total Recommendations: ${totalRecs}`);
        }
        
        return status;
      } else {
        console.error('Status check failed:', result.error);
        return null;
      }
    } catch (error) {
      console.error('Error checking status:', error);
      return null;
    }
  }

  startPolling(intervalSeconds = 3) {
    if (this.polling) return;
    
    console.log(`Starting status polling every ${intervalSeconds} seconds...`);
    this.polling = true;
    
    // Initial check
    this.checkStatus().then(status => {
      if (status && ['recommendations_ready', 'cancelled', 'failed'].includes(status.status)) {
        this.stopPolling();
        console.log('\n🎉 Trip planning completed!');
      }
    });
    
    this.pollInterval = setInterval(async () => {
      const status = await this.checkStatus();
      
      if (status && ['recommendations_ready', 'cancelled', 'failed'].includes(status.status)) {
        this.stopPolling();
        console.log('\n🎉 Trip planning completed!');
      }
    }, intervalSeconds * 1000);
  }

  stopPolling() {
    this.polling = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('Status polling stopped.');
    }
  }
}

// 4. Load Trip Details Example
async function loadTripDetails(tripId) {
  try {
    const response = await fetch(`${API_BASE}/api/trip/${tripId}`);
    const result = await response.json();
    
    if (result.success) {
      const trip = result.data;
      
      console.log('\n--- Trip Details ---');
      console.log(`Title: ${trip.title}`);
      console.log(`Destination: ${trip.destination.name}`);
      console.log(`Origin: ${trip.origin.name}`);
      console.log(`Dates: ${trip.dates.departureDate} to ${trip.dates.returnDate}`);
      console.log(`Duration: ${trip.dates.duration} days`);
      console.log(`Travelers: ${trip.travelers.count}`);
      console.log(`Status: ${trip.status}`);
      
      console.log('\n--- Recommendations Summary ---');
      if (trip.recommendations) {
        Object.entries(trip.recommendations).forEach(([category, recs]) => {
          console.log(`${category}: ${recs.length} options`);
        });
      }
      
      console.log(`Total Recommendations: ${trip.totalRecommendations || 0}`);
      console.log(`Total Selected: ${trip.totalSelectedRecommendations || 0}`);
      
      return trip;
    } else {
      console.error('Failed to load trip:', result.error);
      return null;
    }
  } catch (error) {
    console.error('Error loading trip:', error);
    return null;
  }
}

// 5. Select Recommendations Example
async function selectRecommendations(tripId, selections) {
  const selectionData = {
    selections: selections,
    selectedBy: "demo_user"
  };

  try {
    const response = await fetch(`${API_BASE}/api/trip/${tripId}/select`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(selectionData)
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('\n--- Selection Update ---');
      console.log('Selections updated successfully!');
      console.log('Selection summary:', result.data.selectionSummary);
      console.log('Total selected:', result.data.totalSelected);
      
      return result.data;
    } else {
      console.error('Selection failed:', result.error);
      if (result.details) {
        console.log('Invalid recommendations:', result.details);
      }
      return null;
    }
  } catch (error) {
    console.error('Error selecting recommendations:', error);
    return null;
  }
}

// 6. Rerun Agents Example
async function rerunAgents(tripId, agentList = [], reason = 'Demo rerun') {
  const rerunData = {
    agents: agentList, // Empty array means all agents
    reason: reason,
    resetSelections: false
  };

  try {
    const response = await fetch(`${API_BASE}/api/trip/${tripId}/rerun`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(rerunData)
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('\n--- Agent Rerun ---');
      console.log('Rerun initiated successfully!');
      console.log('Retriggered agents:', result.data.retriggeredAgents);
      console.log('Estimated duration:', result.data.estimatedDuration);
      console.log('New status:', result.data.status);
      
      return result.data;
    } else {
      console.error('Rerun failed:', result.error);
      return null;
    }
  } catch (error) {
    console.error('Error rerunning agents:', error);
    return null;
  }
}

// Complete workflow example
async function completeWorkflowDemo() {
  console.log('🚀 TravlrAPI Complete Workflow Demo');
  console.log('=====================================\n');

  // 1. Health check
  console.log('1. Checking API health...');
  const isHealthy = await healthCheck();
  if (!isHealthy) {
    console.log('❌ API is not healthy. Exiting.');
    return;
  }
  console.log('✅ API is healthy!\n');

  // 2. Create trip
  console.log('2. Creating sample trip...');
  const tripId = await createSampleTrip();
  if (!tripId) {
    console.log('❌ Failed to create trip. Exiting.');
    return;
  }
  console.log(`✅ Trip created: ${tripId}\n`);

  // 3. Monitor progress
  console.log('3. Monitoring trip planning progress...');
  const monitor = new TripStatusMonitor(tripId);
  
  // Poll for up to 2 minutes
  monitor.startPolling(3);
  
  setTimeout(() => {
    if (monitor.polling) {
      monitor.stopPolling();
      console.log('\n⏰ Monitoring timeout - continuing with demo...');
      continueWorkflow(tripId);
    }
  }, 120000); // 2 minutes

  // Continue workflow when polling stops naturally
  const originalStop = monitor.stopPolling.bind(monitor);
  monitor.stopPolling = () => {
    originalStop();
    setTimeout(() => continueWorkflow(tripId), 1000);
  };
}

async function continueWorkflow(tripId) {
  // 4. Load trip details
  console.log('\n4. Loading trip details...');
  const trip = await loadTripDetails(tripId);
  if (!trip) {
    console.log('❌ Failed to load trip details.');
    return;
  }

  // 5. Make sample selections (if recommendations exist)
  if (trip.recommendations && trip.totalRecommendations > 0) {
    console.log('\n5. Making sample selections...');
    
    const sampleSelections = {};
    
    // Select first recommendation from each category that has recommendations
    Object.entries(trip.recommendations).forEach(([category, recs]) => {
      if (recs.length > 0) {
        sampleSelections[category] = [recs[0]._id];
      }
    });
    
    if (Object.keys(sampleSelections).length > 0) {
      await selectRecommendations(tripId, sampleSelections);
    } else {
      console.log('No recommendations available for selection.');
    }
  } else {
    console.log('\n5. No recommendations available yet for selection.');
  }

  // 6. Demo agent rerun
  console.log('\n6. Demonstrating agent rerun...');
  await rerunAgents(tripId, ['flight'], 'Demo: Request different flight options');

  console.log('\n🎉 Workflow demo completed!');
  console.log(`You can continue testing with trip ID: ${tripId}`);
}

// Error handling wrapper
function withErrorHandling(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error(`Error in ${fn.name}:`, error);
      
      if (error.response) {
        console.log('Response status:', error.response.status);
        console.log('Response data:', error.response.data);
      }
      
      return null;
    }
  };
}

// Export functions for use in other modules
module.exports = {
  healthCheck: withErrorHandling(healthCheck),
  createSampleTrip: withErrorHandling(createSampleTrip),
  loadTripDetails: withErrorHandling(loadTripDetails),
  selectRecommendations: withErrorHandling(selectRecommendations),
  rerunAgents: withErrorHandling(rerunAgents),
  TripStatusMonitor,
  completeWorkflowDemo: withErrorHandling(completeWorkflowDemo)
};

// Run demo if this file is executed directly
if (require.main === module) {
  completeWorkflowDemo().catch(console.error);
}