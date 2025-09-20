// test-api-mvp.js - MVP API test suite
// Tests the simplified 6-endpoint API surface

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3000';

// Test utilities
function log(message, emoji = '📋') {
  console.log(`${emoji} ${message}`);
}

function success(message) {
  log(message, '✅');
}

function error(message) {
  log(message, '❌');
}

function info(message) {
  log(message, 'ℹ️');
}

let createdTripId = null;

async function testHealthEndpoint() {
  log('Testing health endpoint...');
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    
    if (response.ok && data.status === 'OK') {
      success('Health endpoint works');
      info(`Database connected: ${data.database.isConnected}`);
      return true;
    } else {
      error('Health endpoint failed');
      return false;
    }
  } catch (err) {
    error(`Health endpoint error: ${err.message}`);
    return false;
  }
}

async function testCreateTrip() {
  log('Testing POST /api/trip/create...');
  
  const tripRequest = {
    title: "MVP Test Trip",
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
      interests: ["cultural", "food"],
      budget: {
        total: 2000,
        currency: "USD"
      }
    },
    collaboration: {
      createdBy: "test_user"
    }
  };

  try {
    const response = await fetch(`${API_BASE}/api/trip/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tripRequest)
    });

    const data = await response.json();
    
    if (data.success && data.data.tripId) {
      createdTripId = data.data.tripId;
      success('Trip creation works');
      info(`Created trip: ${createdTripId}`);
      info(`Status: ${data.data.status}`);
      info(`Duration: ${data.data.dates.duration} days`);
      return true;
    } else {
      error(`Trip creation failed: ${data.error || 'Unknown error'}`);
      if (data.details) {
        console.log('  Details:', data.details);
      }
      return false;
    }
  } catch (err) {
    error(`Trip creation error: ${err.message}`);
    return false;
  }
}

async function testGetTrip() {
  if (!createdTripId) {
    error('Cannot test GET trip - no trip ID available');
    return false;
  }

  log('Testing GET /api/trip/:tripId...');
  
  try {
    const response = await fetch(`${API_BASE}/api/trip/${createdTripId}`);
    const data = await response.json();
    
    if (data.success && data.data.tripId === createdTripId) {
      success('Get trip works');
      info(`Title: ${data.data.title}`);
      info(`Destination: ${data.data.destination.name}`);
      info(`Total recommendations: ${data.data.totalRecommendations || 0}`);
      return true;
    } else {
      error(`Get trip failed: ${data.error || 'Unknown error'}`);
      return false;
    }
  } catch (err) {
    error(`Get trip error: ${err.message}`);
    return false;
  }
}

async function testGetTripStatus() {
  if (!createdTripId) {
    error('Cannot test GET trip status - no trip ID available');
    return false;
  }

  log('Testing GET /api/trip/:tripId/status...');
  
  try {
    const response = await fetch(`${API_BASE}/api/trip/${createdTripId}/status`);
    const data = await response.json();
    
    if (data.success && data.data.tripId === createdTripId) {
      success('Get trip status works');
      info(`Overall status: ${data.data.overallStatus}`);
      info(`Progress: ${data.data.progressPercentage || 0}%`);
      
      if (data.data.agents) {
        const agentStatuses = Object.entries(data.data.agents)
          .map(([name, status]) => `${name}: ${status}`)
          .join(', ');
        info(`Agents: ${agentStatuses}`);
      }
      return true;
    } else {
      error(`Get trip status failed: ${data.error || 'Unknown error'}`);
      return false;
    }
  } catch (err) {
    error(`Get trip status error: ${err.message}`);
    return false;
  }
}

async function testSelectRecommendations() {
  if (!createdTripId) {
    error('Cannot test select recommendations - no trip ID available');
    return false;
  }

  log('Testing PUT /api/trip/:tripId/select...');
  
  const selections = {
    selections: {
      flight: [],
      accommodation: []
    }
  };

  try {
    const response = await fetch(`${API_BASE}/api/trip/${createdTripId}/select`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selections)
    });

    const data = await response.json();
    
    if (response.ok) {
      success('Select recommendations endpoint works');
      info(`Selection success: ${data.success}`);
      if (!data.success && data.message) {
        info(`Message: ${data.message}`);
      }
      return true;
    } else {
      error(`Select recommendations failed: ${data.error || 'Unknown error'}`);
      return false;
    }
  } catch (err) {
    error(`Select recommendations error: ${err.message}`);
    return false;
  }
}

async function testRerunAgents() {
  if (!createdTripId) {
    error('Cannot test rerun agents - no trip ID available');
    return false;
  }

  log('Testing POST /api/trip/:tripId/rerun...');
  
  const rerunRequest = {
    agents: ["flight"],
    reason: "MVP test rerun"
  };

  try {
    const response = await fetch(`${API_BASE}/api/trip/${createdTripId}/rerun`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rerunRequest)
    });

    const data = await response.json();
    
    if (data.success) {
      success('Rerun agents works');
      info(`Rerun agents: ${data.data.retriggeredAgents?.join(', ') || 'none specified'}`);
      info(`Status: ${data.data.status}`);
      return true;
    } else {
      error(`Rerun agents failed: ${data.error || 'Unknown error'}`);
      return false;
    }
  } catch (err) {
    error(`Rerun agents error: ${err.message}`);
    return false;
  }
}

async function testLegacyEndpoints() {
  log('Testing that legacy endpoints return 404...');
  
  const legacyEndpoints = [
    { method: 'POST', path: '/api/trip/plan', name: 'Legacy plan endpoint' },
    { method: 'PATCH', path: `/api/trip/test/selections`, name: 'Legacy selections endpoint' },
    { method: 'POST', path: `/api/trip/test/retrigger`, name: 'Legacy retrigger endpoint' },
    { method: 'GET', path: '/api/trip/agents/status', name: 'Legacy agent status endpoint' },
    { method: 'GET', path: '/api/trip/user', name: 'Legacy user trips endpoint' }
  ];

  let allReturned404 = true;

  for (const endpoint of legacyEndpoints) {
    try {
      const response = await fetch(`${API_BASE}${endpoint.path}`, {
        method: endpoint.method,
        headers: { 'Content-Type': 'application/json' },
        body: endpoint.method !== 'GET' ? '{}' : undefined
      });

      if (response.status === 404) {
        info(`${endpoint.name}: ✓ 404`);
      } else {
        error(`${endpoint.name}: Expected 404, got ${response.status}`);
        allReturned404 = false;
      }
    } catch (err) {
      error(`${endpoint.name}: Error - ${err.message}`);
      allReturned404 = false;
    }
  }

  if (allReturned404) {
    success('All legacy endpoints properly removed (404)');
  } else {
    error('Some legacy endpoints still accessible');
  }

  return allReturned404;
}

async function runAllTests() {
  console.log('🚀 MVP API Test Suite');
  console.log('=====================================');
  console.log('Testing 6 MVP endpoints:\n');

  const tests = [
    { name: 'Health endpoint', fn: testHealthEndpoint },
    { name: 'Create trip', fn: testCreateTrip },
    { name: 'Get trip', fn: testGetTrip },
    { name: 'Get trip status', fn: testGetTripStatus },
    { name: 'Select recommendations', fn: testSelectRecommendations },
    { name: 'Rerun agents', fn: testRerunAgents },
    { name: 'Legacy endpoint removal', fn: testLegacyEndpoints }
  ];

  const results = [];
  
  for (const test of tests) {
    console.log(`\n--- ${test.name} ---`);
    const result = await test.fn();
    results.push({ name: test.name, passed: result });
    
    if (!result) {
      console.log('⏸️  Continuing with remaining tests...');
    }
  }

  console.log('\n=====================================');
  console.log('📊 TEST SUMMARY');
  console.log('=====================================');

  let passedCount = 0;
  results.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${result.name}`);
    if (result.passed) passedCount++;
  });

  console.log(`\n📈 Results: ${passedCount}/${results.length} tests passed`);
  
  if (passedCount === results.length) {
    console.log('🎉 All tests passed! MVP API is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the details above.');
  }

  if (createdTripId) {
    console.log(`\n🗒️  Note: Test trip created with ID: ${createdTripId}`);
    console.log('   You can manually test endpoints with this trip ID.');
  }

  return passedCount === results.length;
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Test suite crashed:', error);
      process.exit(1);
    });
}

export { runAllTests };