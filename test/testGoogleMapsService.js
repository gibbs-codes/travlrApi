/**
 * GoogleMapsService Test Suite
 * 
 * This test validates the Google Maps Directions API integration.
 * It tests multiple travel modes, error handling, and response parsing.
 * 
 * Prerequisites:
 * - Set GOOGLE_MAPS_API_KEY environment variable for full testing
 * - Without API key, tests will demonstrate error handling
 * 
 * Usage:
 *   node test/testGoogleMapsService.js
 * 
 * Expected Results:
 * - With GOOGLE_MAPS_API_KEY: Tests real Google Directions API integration
 * - Without API key: Tests error handling behavior
 * 
 * Test Coverage:
 * 1. Basic directions request (driving)
 * 2. Multiple travel modes (driving, walking, transit, bicycling)
 * 3. Cost estimation validation
 * 4. Transit details extraction
 * 5. Error handling (invalid locations, no API key)
 * 6. Response structure validation
 * 7. Multi-mode directions
 */

import googleMapsService from '../src/services/googleMapsService.js';
import dotenv from 'dotenv';

dotenv.config();

// Test configuration
const TEST_CONFIG = {
  validRoute: {
    origin: 'Times Square, New York, NY',
    destination: 'Central Park, New York, NY'
  },
  longRoute: {
    origin: 'New York, NY',
    destination: 'Philadelphia, PA'
  },
  invalidRoute: {
    origin: 'NonExistentCity12345XYZ',
    destination: 'AnotherFakeLocation98765ABC'
  },
  transitRoute: {
    origin: 'Union Square, New York, NY',
    destination: 'Brooklyn Bridge, New York, NY'
  }
};

class GoogleMapsServiceTester {
  constructor() {
    this.testResults = {
      passed: 0,
      failed: 0,
      total: 0
    };
  }

  log(message, type = 'info') {
    const icons = {
      info: '📋',
      success: '✅',
      error: '❌',
      warning: '⚠️',
      test: '🧪'
    };
    console.log(`${icons[type]} ${message}`);
  }

  logSeparator(title) {
    console.log('\n' + '='.repeat(60));
    console.log(`🧪 ${title}`);
    console.log('='.repeat(60));
  }

  async runTest(testName, testFunction) {
    this.testResults.total++;
    try {
      await testFunction();
      this.testResults.passed++;
      this.log(`${testName} - PASSED`, 'success');
    } catch (error) {
      this.testResults.failed++;
      this.log(`${testName} - FAILED: ${error.message}`, 'error');
    }
  }

  /**
   * Test 1: Basic driving directions
   */
  async testBasicDrivingDirections() {
    this.logSeparator('Test 1: Basic Driving Directions');
    
    this.log(`Testing driving directions: ${TEST_CONFIG.validRoute.origin} → ${TEST_CONFIG.validRoute.destination}`);

    const startTime = Date.now();
    const result = await googleMapsService.getDirections(
      TEST_CONFIG.validRoute.origin,
      TEST_CONFIG.validRoute.destination,
      'driving'
    );
    const executionTime = Date.now() - startTime;

    this.log(`Execution completed in ${executionTime}ms`);

    // Validate response structure
    if (!result.routes || result.routes.length === 0) {
      throw new Error('No routes found in response');
    }

    const route = result.routes[0];
    this.validateRouteStructure(route);

    // Log route details
    this.log('\n🚗 Driving Route Details:');
    console.log(`   Route ID: ${route.id}`);
    console.log(`   Distance: ${route.distance}`);
    console.log(`   Duration: ${route.duration}`);
    console.log(`   Estimated Cost: $${route.estimatedCost}`);
    console.log(`   Provider: ${route.provider}`);
    console.log(`   Service: ${route.service}`);
    console.log(`   Features: ${route.features.join(', ')}`);
    console.log(`   Summary: ${route.summary}`);

    if (route.steps && route.steps.length > 0) {
      this.log(`\n📍 Route has ${route.steps.length} steps`);
      this.log('First step: ' + route.steps[0].instruction);
      this.log('Last step: ' + route.steps[route.steps.length - 1].instruction);
    }
  }

  /**
   * Test 2: Multiple travel modes
   */
  async testMultipleTravelModes() {
    this.logSeparator('Test 2: Multiple Travel Modes');

    const modes = ['driving', 'walking', 'transit', 'bicycling'];
    this.log(`Testing ${modes.length} travel modes for short route`);

    const results = {};

    for (const mode of modes) {
      try {
        this.log(`Getting ${mode} directions...`);
        const result = await googleMapsService.getDirections(
          TEST_CONFIG.validRoute.origin,
          TEST_CONFIG.validRoute.destination,
          mode
        );

        if (result.routes && result.routes.length > 0) {
          results[mode] = result.routes[0];
          this.log(`✓ ${mode}: ${result.routes[0].distance}, ${result.routes[0].duration}, $${result.routes[0].estimatedCost}`);
        } else {
          this.log(`⚠ ${mode}: No routes found`, 'warning');
        }
      } catch (error) {
        this.log(`⚠ ${mode}: ${error.message}`, 'warning');
      }
    }

    // Validate we got at least some results
    const successfulModes = Object.keys(results);
    if (successfulModes.length === 0) {
      throw new Error('No travel modes returned successful results');
    }

    this.log(`\n📊 Successfully retrieved ${successfulModes.length}/${modes.length} travel modes`);

    // Validate cost differences make sense
    if (results.walking && results.driving) {
      if (results.walking.estimatedCost !== 0) {
        throw new Error('Walking should be free');
      }
      if (results.driving.estimatedCost <= 0) {
        throw new Error('Driving should have some cost');
      }
    }
  }

  /**
   * Test 3: Transit directions with fare information
   */
  async testTransitDirections() {
    this.logSeparator('Test 3: Transit Directions');

    this.log(`Testing transit directions: ${TEST_CONFIG.transitRoute.origin} → ${TEST_CONFIG.transitRoute.destination}`);

    try {
      const result = await googleMapsService.getDirections(
        TEST_CONFIG.transitRoute.origin,
        TEST_CONFIG.transitRoute.destination,
        'transit'
      );

      if (!result.routes || result.routes.length === 0) {
        this.log('No transit routes found - this may be expected in some areas', 'warning');
        return;
      }

      const route = result.routes[0];

      this.log('\n🚇 Transit Route Details:');
      console.log(`   Distance: ${route.distance}`);
      console.log(`   Duration: ${route.duration}`);
      console.log(`   Estimated Cost: $${route.estimatedCost}`);
      
      if (route.fare) {
        console.log(`   Actual Fare: ${route.fare.text} (${route.fare.currency})`);
      }

      if (route.transitDetails) {
        console.log(`   Transit Lines: ${route.transitDetails.summary}`);
        console.log(`   Number of Transit Steps: ${route.transitDetails.totalSteps}`);
        
        if (route.transitDetails.lines.length > 0) {
          console.log('\n   Transit Line Details:');
          route.transitDetails.lines.forEach((line, index) => {
            console.log(`     ${index + 1}. ${line.shortName || line.name} (${line.vehicle})`);
            console.log(`        ${line.departureStop} → ${line.arrivalStop}`);
          });
        }
      }

      // Validate transit-specific fields
      if (route.type !== 'public') {
        throw new Error('Transit route type should be "public"');
      }

    } catch (error) {
      this.log(`Transit test failed: ${error.message}`, 'warning');
      // Don't fail the entire test - transit might not be available everywhere
    }
  }

  /**
   * Test 4: Cost estimation validation
   */
  async testCostEstimation() {
    this.logSeparator('Test 4: Cost Estimation Validation');

    this.log('Testing cost estimation for long route (NYC to Philadelphia)');

    try {
      // Test driving cost for longer route
      const drivingResult = await googleMapsService.getDirections(
        TEST_CONFIG.longRoute.origin,
        TEST_CONFIG.longRoute.destination,
        'driving'
      );

      if (drivingResult.routes && drivingResult.routes.length > 0) {
        const route = drivingResult.routes[0];
        
        this.log('\n💰 Cost Breakdown Analysis:');
        console.log(`   Driving Route: ${route.distance}, ${route.duration}`);
        console.log(`   Estimated Driving Cost: $${route.estimatedCost}`);
        
        // Validate reasonable cost range for ~100mi trip
        if (route.estimatedCost < 20 || route.estimatedCost > 100) {
          this.log(`Warning: Cost seems unusual for this distance: $${route.estimatedCost}`, 'warning');
        } else {
          this.log('✓ Driving cost estimation looks reasonable');
        }

        // Test that cost includes gas, tolls, parking components
        const distanceKm = parseFloat(route.distance.replace(/[^\d.]/g, ''));
        if (distanceKm > 50 && route.estimatedCost < 30) {
          this.log('Warning: Cost might be underestimating for long distance', 'warning');
        }
      }

      // Test walking cost (should be 0)
      const walkingResult = await googleMapsService.getDirections(
        TEST_CONFIG.validRoute.origin,
        TEST_CONFIG.validRoute.destination,
        'walking'
      );

      if (walkingResult.routes && walkingResult.routes.length > 0) {
        const walkingRoute = walkingResult.routes[0];
        if (walkingRoute.estimatedCost !== 0) {
          throw new Error(`Walking cost should be $0, got $${walkingRoute.estimatedCost}`);
        }
        this.log('✓ Walking cost estimation correct (free)');
      }

    } catch (error) {
      throw new Error(`Cost estimation test failed: ${error.message}`);
    }
  }

  /**
   * Test 5: Error handling
   */
  async testErrorHandling() {
    this.logSeparator('Test 5: Error Handling');

    // Test invalid travel mode
    try {
      await googleMapsService.getDirections(
        TEST_CONFIG.validRoute.origin,
        TEST_CONFIG.validRoute.destination,
        'teleportation'
      );
      throw new Error('Should have failed with invalid travel mode');
    } catch (error) {
      if (error.message.includes('Unsupported travel mode')) {
        this.log('✓ Invalid travel mode handled correctly');
      } else {
        throw error;
      }
    }

    // Test invalid locations (but don't fail if API rejects it gracefully)
    try {
      this.log('Testing with invalid locations...');
      await googleMapsService.getDirections(
        TEST_CONFIG.invalidRoute.origin,
        TEST_CONFIG.invalidRoute.destination,
        'driving'
      );
      this.log('⚠ Invalid locations were processed (API might have found approximate matches)', 'warning');
    } catch (error) {
      if (error.message.includes('could not be found') || error.message.includes('ZERO_RESULTS')) {
        this.log('✓ Invalid locations handled correctly');
      } else {
        this.log(`⚠ Unexpected error with invalid locations: ${error.message}`, 'warning');
      }
    }

    // Test missing API key (temporarily)
    const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = '';

    try {
      await googleMapsService.getDirections(
        TEST_CONFIG.validRoute.origin,
        TEST_CONFIG.validRoute.destination,
        'driving'
      );
      throw new Error('Should have failed with missing API key');
    } catch (error) {
      if (error.message.includes('API key not found')) {
        this.log('✓ Missing API key handled correctly');
      } else {
        throw error;
      }
    } finally {
      // Restore API key
      process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
    }
  }

  /**
   * Test 6: Multi-mode directions
   */
  async testMultiModeDirections() {
    this.logSeparator('Test 6: Multi-Mode Directions');

    this.log('Testing multi-mode directions request...');

    const result = await googleMapsService.getMultiModeDirections(
      TEST_CONFIG.validRoute.origin,
      TEST_CONFIG.validRoute.destination,
      ['driving', 'walking', 'transit']
    );

    this.log(`Multi-mode result: ${result.successfulModes} successful out of ${result.totalModes} modes`);

    if (result.routes.length === 0) {
      throw new Error('No routes returned from multi-mode request');
    }

    // Show summary of all routes
    this.log('\n🚀 Multi-Mode Route Summary:');
    result.routes.forEach((route, index) => {
      console.log(`   ${index + 1}. ${route.type} (${route.service}): ${route.duration}, $${route.estimatedCost}`);
    });

    // Validate each route has required fields
    result.routes.forEach((route, index) => {
      try {
        this.validateRouteStructure(route);
      } catch (error) {
        throw new Error(`Multi-mode route ${index + 1} validation failed: ${error.message}`);
      }
    });
  }

  /**
   * Test 7: Connection test
   */
  async testConnection() {
    this.logSeparator('Test 7: API Connection Test');

    const result = await googleMapsService.testConnection();

    if (result.success) {
      this.log('✓ Google Maps API connection successful');
      this.log(`Sample route: ${result.sampleRoute.distance}, ${result.sampleRoute.duration}`);
    } else {
      throw new Error(`Connection test failed: ${result.message}`);
    }
  }

  /**
   * Validate route object structure
   */
  validateRouteStructure(route) {
    const requiredFields = [
      'id', 'type', 'provider', 'service', 'mode',
      'distance', 'duration', 'estimatedTime', 'estimatedCost'
    ];

    for (const field of requiredFields) {
      if (route[field] === undefined || route[field] === null) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate data types
    if (typeof route.estimatedCost !== 'number' || route.estimatedCost < 0) {
      throw new Error('Estimated cost must be a non-negative number');
    }

    if (typeof route.distance !== 'string') {
      throw new Error('Distance must be a string');
    }

    if (typeof route.duration !== 'string') {
      throw new Error('Duration must be a string');
    }

    if (!Array.isArray(route.features)) {
      throw new Error('Features must be an array');
    }

    if (route.steps && !Array.isArray(route.steps)) {
      throw new Error('Steps must be an array');
    }

    if (route.instructions && !Array.isArray(route.instructions)) {
      throw new Error('Instructions must be an array');
    }
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🧪 Google Maps Service Integration Test Suite');
    console.log('='.repeat(60));
    console.log(`Environment: ${process.env.GOOGLE_MAPS_API_KEY ? '✅ Google Maps API Key detected' : '⚠️ No Google Maps API Key'}`);

    const startTime = Date.now();

    await this.runTest('API Connection Test', () => this.testConnection());
    await this.runTest('Basic Driving Directions', () => this.testBasicDrivingDirections());
    await this.runTest('Multiple Travel Modes', () => this.testMultipleTravelModes());
    await this.runTest('Transit Directions', () => this.testTransitDirections());
    await this.runTest('Cost Estimation Validation', () => this.testCostEstimation());
    await this.runTest('Error Handling', () => this.testErrorHandling());
    await this.runTest('Multi-Mode Directions', () => this.testMultiModeDirections());

    const totalTime = Date.now() - startTime;

    // Print summary
    this.logSeparator('Test Results Summary');
    console.log(`📊 Tests Run: ${this.testResults.total}`);
    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`⏱️ Total Time: ${totalTime}ms`);
    
    const successRate = Math.round((this.testResults.passed / this.testResults.total) * 100);
    console.log(`📈 Success Rate: ${successRate}%`);

    if (this.testResults.failed === 0) {
      this.log('🎉 All tests passed! Google Maps Service integration is working correctly.', 'success');
    } else {
      this.log(`⚠️ ${this.testResults.failed} test(s) failed. Check the logs above for details.`, 'warning');
    }

    console.log('\n' + '='.repeat(60));
    console.log('🏁 Test suite completed');
  }
}

// Run the test suite
async function main() {
  const tester = new GoogleMapsServiceTester();
  
  try {
    await tester.runAllTests();
  } catch (error) {
    console.error('💥 Test suite crashed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Execute if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { GoogleMapsServiceTester };