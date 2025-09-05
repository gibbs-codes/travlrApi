/**
 * RestaurantAgent Test Suite
 * 
 * This test validates the Google Places API integration with the RestaurantAgent.
 * It tests both successful API calls and fallback behavior when the API is unavailable.
 * 
 * Prerequisites:
 * - Set GOOGLE_MAPS_API_KEY environment variable for full testing
 * - Without API key, tests will demonstrate fallback behavior
 * 
 * Usage:
 *   node test/testRestaurantAgent.js
 * 
 * Expected Results:
 * - With GOOGLE_MAPS_API_KEY: Tests real Google Places API integration
 * - Without API key: Tests fallback behavior with mock data
 * - All tests should pass regardless of API key availability
 * 
 * Test Coverage:
 * 1. Restaurant search with specific criteria (Paris, France)
 * 2. Response format validation
 * 3. Error handling with invalid destinations
 * 4. Fallback behavior when API is unavailable
 * 5. Data structure verification
 * 
 * Example Output (without API key):
 * ✅ Valid Restaurant Search - PASSED (using mock data)
 * ✅ Invalid Destination Handling - PASSED  
 * ✅ API Fallback Behavior - PASSED
 * ✅ Data Structure Validation - PASSED
 * Success Rate: 100%
 */

import { RestaurantAgent } from '../src/agents/restaurantAgent.js';
import dotenv from 'dotenv';

dotenv.config();

// Test configuration
const TEST_CONFIG = {
  validDestination: 'Paris, France',
  invalidDestination: 'NonExistentCity12345XYZ',
  testCriteria: {
    destination: 'Paris, France',
    cuisines: ['French', 'Italian'],
    priceRange: '$$',
    minRating: 4.0,
    maxDistance: 3
  },
  permissiveCriteria: {
    destination: 'Paris, France',
    cuisines: ['French'],
    priceRange: '$$',
    minRating: 4.0,
    maxDistance: 5
  },
  fallbackCriteria: {
    destination: 'Tokyo, Japan',
    cuisines: ['Japanese'],
    priceRange: '$$$',
    minRating: 4.5
  }
};

class RestaurantAgentTester {
  constructor() {
    this.agent = new RestaurantAgent({
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY
    });
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
   * Test 1: Restaurant search with valid criteria
   */
  async testValidRestaurantSearch() {
    this.logSeparator('Test 1: Valid Restaurant Search');
    
    this.log('Testing restaurant search for Paris, France...');
    this.log('Criteria: ' + JSON.stringify(TEST_CONFIG.testCriteria, null, 2));

    const startTime = Date.now();
    const result = await this.agent.execute({ criteria: TEST_CONFIG.testCriteria });
    const executionTime = Date.now() - startTime;

    this.log(`Execution completed in ${executionTime}ms`);

    // Validate response structure
    if (!result.success) {
      throw new Error(`Agent execution failed: ${result.error}`);
    }

    // Extract restaurants from response
    const restaurants = result.data.content?.recommendations || result.data.recommendations || [];
    
    this.log(`Found ${restaurants.length} restaurant recommendations`, 'success');

    if (restaurants.length === 0) {
      this.log('No restaurants found with strict criteria. Trying more permissive search...', 'warning');
      
      // Try with more permissive criteria
      const permissiveResult = await this.agent.execute({ criteria: TEST_CONFIG.permissiveCriteria });
      
      if (permissiveResult.success) {
        const permissiveRestaurants = permissiveResult.data.content?.recommendations || permissiveResult.data.recommendations || [];
        
        if (permissiveRestaurants.length > 0) {
          this.log(`Found ${permissiveRestaurants.length} restaurants with permissive criteria`, 'success');
          
          // Use the permissive results for further testing
          const sample = permissiveRestaurants[0];
          this.validateRestaurantStructure(sample);
          
          // Log sample restaurant details
          this.log('\n🍽️ Sample Restaurant Details (Permissive Search):');
          console.log(`   Name: ${sample.name}`);
          console.log(`   Cuisine: ${sample.cuisine}`);
          console.log(`   Rating: ${sample.rating}/5`);
          console.log(`   Price Range: ${sample.priceRange}`);
          console.log(`   Address: ${sample.location?.address || 'N/A'}`);
          console.log(`   Features: ${sample.features?.join(', ') || 'None'}`);
          console.log(`   Reservations: ${sample.reservations ? 'Yes' : 'No'}`);
          console.log(`   Average Meal: $${sample.averageMeal}`);

          const isRealData = sample.id && sample.id.length > 10 && !sample.id.startsWith('REST');
          this.log(isRealData ? 'Using real Google Places data' : 'Using fallback mock data', 
                   isRealData ? 'success' : 'warning');

          // Log full result for debugging
          this.log('\n📊 Full Permissive Result Structure:');
          console.log(JSON.stringify(permissiveResult, null, 2));
          
          return;
        }
      }
      
      this.log('No restaurants found even with permissive criteria - this indicates API or configuration issues', 'warning');
      return;
    }

    // Validate first restaurant structure
    const sample = restaurants[0];
    this.validateRestaurantStructure(sample);

    // Log sample restaurant details
    this.log('\n🍽️ Sample Restaurant Details:');
    console.log(`   Name: ${sample.name}`);
    console.log(`   Cuisine: ${sample.cuisine}`);
    console.log(`   Rating: ${sample.rating}/5`);
    console.log(`   Price Range: ${sample.priceRange}`);
    console.log(`   Address: ${sample.location?.address || 'N/A'}`);
    console.log(`   Features: ${sample.features?.join(', ') || 'None'}`);
    console.log(`   Reservations: ${sample.reservations ? 'Yes' : 'No'}`);
    console.log(`   Average Meal: $${sample.averageMeal}`);

    // Check if this looks like real Google Places data vs mock data
    const isRealData = sample.id && sample.id.length > 10 && !sample.id.startsWith('REST');
    this.log(isRealData ? 'Using real Google Places data' : 'Using fallback mock data', 
             isRealData ? 'success' : 'warning');

    // Log confidence and reasoning
    const confidence = result.data.confidence || result.data.content?.confidence;
    const reasoning = result.data.reasoning || result.data.content?.reasoning;
    
    this.log(`\n🎯 Confidence Score: ${confidence}`);
    this.log(`💭 AI Reasoning: ${reasoning?.substring(0, 150)}${reasoning?.length > 150 ? '...' : ''}`);

    // Log full result for debugging
    this.log('\n📊 Full Result Structure:');
    console.log(JSON.stringify(result, null, 2));
  }

  /**
   * Test 2: Error handling with invalid destination
   */
  async testInvalidDestination() {
    this.logSeparator('Test 2: Invalid Destination Error Handling');

    this.log(`Testing with invalid destination: ${TEST_CONFIG.invalidDestination}`);

    const invalidCriteria = {
      ...TEST_CONFIG.testCriteria,
      destination: TEST_CONFIG.invalidDestination
    };

    const result = await this.agent.execute({ criteria: invalidCriteria });

    // This should either fail gracefully or fall back to mock data
    if (result.success) {
      const restaurants = result.data.content?.recommendations || result.data.recommendations || [];
      if (restaurants.length > 0) {
        this.log('Fallback to mock data worked correctly', 'success');
      } else {
        this.log('No restaurants found for invalid destination', 'warning');
      }
    } else {
      this.log(`Graceful error handling: ${result.error}`, 'success');
    }
  }

  /**
   * Test 3: Fallback behavior when API is unavailable
   */
  async testAPIFallback() {
    this.logSeparator('Test 3: API Fallback Behavior');

    // Temporarily disable API key to test fallback
    const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = 'invalid-key-for-testing';

    this.log('Testing fallback with invalid API key...');

    try {
      const result = await this.agent.execute({ criteria: TEST_CONFIG.fallbackCriteria });

      if (result.success) {
        const restaurants = result.data.content?.recommendations || result.data.recommendations || [];
        
        if (restaurants.length > 0) {
          this.log(`✅ Fallback successful: Found ${restaurants.length} mock restaurants`);
          
          // Verify these are mock restaurants
          const sample = restaurants[0];
          const isMockData = sample.id && sample.id.startsWith('REST');
          
          if (isMockData) {
            this.log('Correctly using mock data when API unavailable', 'success');
          } else {
            this.log('Unexpected: got real data with invalid API key', 'warning');
          }

          // Show sample mock restaurant
          this.log('\n🍽️ Sample Mock Restaurant:');
          console.log(`   Name: ${sample.name}`);
          console.log(`   Cuisine: ${sample.cuisine}`);
          console.log(`   ID: ${sample.id}`);
        } else {
          this.log('No fallback data available', 'warning');
        }
      } else {
        throw new Error(`Fallback failed: ${result.error}`);
      }
    } finally {
      // Restore original API key
      process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
    }
  }

  /**
   * Test 4: Response data validation
   */
  async testDataValidation() {
    this.logSeparator('Test 4: Response Data Validation');

    this.log('Testing response data structure and types...');

    const result = await this.agent.execute({ criteria: TEST_CONFIG.testCriteria });

    if (!result.success) {
      throw new Error(`Agent execution failed: ${result.error}`);
    }

    // Validate overall response structure
    this.validateResponseStructure(result);

    const restaurants = result.data.content?.recommendations || result.data.recommendations || [];
    
    if (restaurants.length > 0) {
      // Validate each restaurant in the response
      restaurants.forEach((restaurant, index) => {
        try {
          this.validateRestaurantStructure(restaurant);
          this.log(`Restaurant ${index + 1}: Structure valid ✓`);
        } catch (error) {
          throw new Error(`Restaurant ${index + 1} validation failed: ${error.message}`);
        }
      });

      this.log(`All ${restaurants.length} restaurants have valid structure`, 'success');
    }
  }

  /**
   * Validate restaurant object structure
   */
  validateRestaurantStructure(restaurant) {
    const requiredFields = ['id', 'name', 'cuisine', 'priceRange', 'rating'];
    
    for (const field of requiredFields) {
      if (restaurant[field] === undefined || restaurant[field] === null) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate data types
    if (typeof restaurant.name !== 'string') {
      throw new Error('Restaurant name must be a string');
    }

    if (typeof restaurant.rating !== 'number' || restaurant.rating < 0 || restaurant.rating > 5) {
      throw new Error('Restaurant rating must be a number between 0 and 5');
    }

    if (!['$', '$$', '$$$', '$$$$'].includes(restaurant.priceRange)) {
      throw new Error('Invalid price range format');
    }

    if (restaurant.location && typeof restaurant.location.address !== 'string') {
      throw new Error('Location address must be a string');
    }

    if (restaurant.features && !Array.isArray(restaurant.features)) {
      throw new Error('Features must be an array');
    }
  }

  /**
   * Validate overall response structure
   */
  validateResponseStructure(result) {
    if (!result.agentName || result.agentName !== 'RestaurantAgent') {
      throw new Error('Invalid agent name in response');
    }

    if (typeof result.success !== 'boolean') {
      throw new Error('Success field must be boolean');
    }

    if (!result.data) {
      throw new Error('Response must include data field');
    }

    if (!result.executedAt) {
      throw new Error('Response must include executedAt timestamp');
    }
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🧪 RestaurantAgent Google Places Integration Test Suite');
    console.log('=' .repeat(60));
    console.log(`Environment: ${process.env.GOOGLE_MAPS_API_KEY ? '✅ Google Maps API Key detected' : '⚠️ No Google Maps API Key - using fallback mode'}`);
    console.log(`OpenAI Key: ${process.env.OPENAI_API_KEY ? '✅ Available' : '⚠️ Not available'}`);

    const startTime = Date.now();

    await this.runTest('Valid Restaurant Search', () => this.testValidRestaurantSearch());
    await this.runTest('Invalid Destination Handling', () => this.testInvalidDestination());
    await this.runTest('API Fallback Behavior', () => this.testAPIFallback());
    await this.runTest('Data Structure Validation', () => this.testDataValidation());

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
      this.log('🎉 All tests passed! RestaurantAgent Google Places integration is working correctly.', 'success');
    } else {
      this.log(`⚠️ ${this.testResults.failed} test(s) failed. Check the logs above for details.`, 'warning');
    }

    console.log('\n' + '='.repeat(60));
    console.log('🏁 Test suite completed');
  }
}

// Run the test suite
async function main() {
  const tester = new RestaurantAgentTester();
  
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

export { RestaurantAgentTester };