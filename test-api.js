// test-api.js - Simple test script to validate the API
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3006';

async function testHealthEndpoint() {
  console.log('🧪 Testing health endpoint...');
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    console.log('✅ Health check passed:', data);
    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function testTripPlanningEndpoint() {
  console.log('🧪 Testing trip planning endpoint...');
  
  const tripRequest = {
    destination: 'Paris',
    origin: 'New York',
    departureDate: '2024-03-15',
    returnDate: '2024-03-20',
    travelers: 2,
    interests: ['cultural', 'food'],
    preferences: {
      flightClass: 'Economy',
      accommodationType: 'hotel',
      minRating: 4.0
    }
  };

  try {
    const response = await fetch(`${API_BASE}/api/trip/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tripRequest),
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Trip planning test passed!');
      console.log('📊 Trip Summary:');
      console.log(`   Destination: ${data.data.tripSummary.destination}`);
      console.log(`   Confidence: ${data.data.tripSummary.confidence}%`);
      console.log('📋 Recommendations found:');
      console.log(`   Flights: ${data.data.recommendations?.flights?.length || 0}`);
      console.log(`   Accommodation: ${data.data.recommendations?.accommodation?.length || 0}`);
      console.log(`   Activities: ${data.data.recommendations?.activities?.length || 0}`);
      console.log(`   Restaurants: ${data.data.recommendations?.restaurants?.length || 0}`);
      console.log(`   Transportation: ${data.data.recommendations?.transportation?.length || 0}`);
      console.log(`⏱️  Execution time: ${data.data.metadata.executionTime}`);
      return true;
    } else {
      console.error('❌ Trip planning failed:', data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Trip planning request failed:', error.message);
    return false;
  }
}

async function testAgentStatusEndpoint() {
  console.log('🧪 Testing agent status endpoint...');
  try {
    const response = await fetch(`${API_BASE}/api/trip/agents/status`);
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Agent status test passed!');
      console.log(`📊 Found ${data.data.agents.length} agents available`);
      return true;
    } else {
      console.error('❌ Agent status failed:', data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Agent status request failed:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting API Tests...\n');
  
  const healthOk = await testHealthEndpoint();
  console.log('');
  
  if (!healthOk) {
    console.log('❌ Health check failed, skipping other tests');
    return;
  }
  
  const tripOk = await testTripPlanningEndpoint();
  console.log('');
  
  const statusOk = await testAgentStatusEndpoint();
  console.log('');
  
  const allPassed = healthOk && tripOk && statusOk;
  
  console.log('📊 Test Summary:');
  console.log(`   Health Endpoint: ${healthOk ? '✅' : '❌'}`);
  console.log(`   Trip Planning: ${tripOk ? '✅' : '❌'}`);
  console.log(`   Agent Status: ${statusOk ? '✅' : '❌'}`);
  console.log(`   Overall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  if (allPassed) {
    console.log('\n🎉 Your TravlrApi is ready for demo!');
    console.log('💡 Try these example requests in the chat:');
    console.log('   - "Plan a 5-day trip to Paris"');
    console.log('   - "I want to visit Tokyo for a week"');
    console.log('   - "Plan a 3-day trip to Rome"');
  }
}

runAllTests().catch(console.error);
