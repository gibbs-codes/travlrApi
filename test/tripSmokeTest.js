import fetch from 'node-fetch';

const API_BASE = process.env.TRAVLR_API_BASE_URL || 'http://localhost:3006';
const POLL_INTERVAL_MS = Number(process.env.TRIP_STATUS_POLL_INTERVAL_MS || 5000);
const POLL_TIMEOUT_MS = Number(process.env.TRIP_STATUS_POLL_TIMEOUT_MS || 120000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildFutureDate = (daysAhead) => {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().split('T')[0];
};

async function createTrip() {
  const departureDate = buildFutureDate(30);
  const returnDate = buildFutureDate(35);

  const response = await fetch(`${API_BASE}/api/trip/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: 'Smoke Test Trip',
      destination: 'New York',
      origin: 'Los Angeles',
      departureDate,
      returnDate,
      travelers: 2,
      interests: ['food', 'cultural'],
      budget: {
        total: 4000,
        flight: 1500,
        accommodation: 1800,
        activities: 400,
        food: 300
      },
      preferences: {
        flightClass: 'economy',
        accommodationType: 'hotel',
        minRating: 3.5,
        requiredAmenities: ['wifi']
      },
      createdBy: 'smoke-test-runner',
      triggerOrchestrator: true
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Trip creation failed: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const payload = await response.json();
  if (!payload.success || !payload.data?.tripId) {
    throw new Error(`Trip creation response invalid: ${JSON.stringify(payload)}`);
  }

  console.log('🚀 Trip created:', payload.data.tripId);
  return payload.data.tripId;
}

async function pollTripStatus(tripId) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const response = await fetch(`${API_BASE}/api/trip/${tripId}/status`);
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Status check failed: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const payload = await response.json();
    if (!payload.success) {
      throw new Error(`Status check returned error: ${JSON.stringify(payload)}`);
    }

    const execution = payload.data?.execution;
    const status = execution?.status;

    console.log('⏳ Trip status:', status, 'recommendations:', payload.data?.recommendationCounts);

    if (['completed', 'failed', 'partial'].includes(status)) {
      return payload.data;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Trip status polling timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

async function fetchTrip(tripId) {
  const response = await fetch(`${API_BASE}/api/trip/${tripId}`);
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Trip retrieval failed: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const payload = await response.json();
  if (!payload.success || !payload.data) {
    throw new Error(`Trip retrieval response invalid: ${JSON.stringify(payload)}`);
  }

  return payload.data;
}

function assertRecommendations(tripData, statusData) {
  const flights = Array.isArray(tripData.recommendations?.flight) ? tripData.recommendations.flight : [];
  const hotels = Array.isArray(tripData.recommendations?.accommodation) ? tripData.recommendations.accommodation : [];
  const totalRecommendations = flights.length + hotels.length;

  console.log('📈 Recommendation counts:', {
    flights: flights.length,
    accommodation: hotels.length
  });

  if (totalRecommendations >= 1) {
    return;
  }

  const flightErrors = statusData.execution?.agents?.flight?.errors || [];
  const accommodationErrors = statusData.execution?.agents?.accommodation?.errors || [];

  if (flightErrors.length === 0 && accommodationErrors.length === 0) {
    throw new Error('No flight or accommodation recommendations saved and no validation errors recorded');
  }

  console.log('ℹ️ No recommendations saved, but validation errors were recorded.');
  console.log('   Flight errors:', flightErrors.map((err) => err.message));
  console.log('   Accommodation errors:', accommodationErrors.map((err) => err.message));
}

async function run() {
  console.log('🧪 Starting trip smoke test...');

  const tripId = await createTrip();
  const statusData = await pollTripStatus(tripId);
  const tripData = await fetchTrip(tripId);

  assertRecommendations(tripData, statusData);

  console.log('✅ Trip smoke test passed:', {
    tripId,
    status: statusData.status,
    executionStatus: statusData.execution.status
  });
}

run().catch((error) => {
  console.error('❌ Trip smoke test failed:', error);
  process.exit(1);
});
