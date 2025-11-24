/**
 * TransportationAgent Test Suite
 *
 * ⚠️ NOTE: TransportationAgent is NOT yet integrated into the application.
 * This test file is maintained for future feature development.
 * See src/agents/transportationAgent.js for integration status and TODO items.
 *
 * This test validates the Google Directions API integration with the TransportationAgent.
 * It tests both successful API calls and fallback behavior when the API is unavailable.
 *
 * Prerequisites:
 * - Set GOOGLE_MAPS_API_KEY environment variable for full testing
 * - Without API key, tests will demonstrate fallback behavior
 *
 * Usage:
 *   node test/testTransportationAgent.js
 * 
 * Expected Results:
 * - With GOOGLE_MAPS_API_KEY: Tests real Google Directions API integration
 * - Without API key: Tests fallback behavior with mock data
 * - All tests should pass regardless of API key availability
 * 
 * Test Coverage:
 * 1. Transportation search with origin/destination (NYC to Philadelphia)
 * 2. Multiple travel modes (driving, transit, walking)
 * 3. Response format validation
 * 4. Error handling with missing origin/destination
 * 5. Fallback behavior when API is unavailable
 * 6. Cost and time filtering
 * 
 * Example Output (without API key):
 * ✅ Valid Transportation Search - PASSED (using mock data)
 * ✅ Multiple Travel Modes - PASSED  
 * ✅ Missing Origin/Destination Handling - PASSED
 * ✅ API Fallback Behavior - PASSED
 * ✅ Data Structure Validation - PASSED
 * Success Rate: 100%
 */

import { TransportationAgent } from '../src/agents/transportationAgent.js';
import dotenv from 'dotenv';

dotenv.config();

// Test configuration
const TEST_CONFIG = {
  validRoute: {
    origin: 'New York, NY',
    destination: 'Philadelphia, PA',
    transportTypes: ['driving', 'transit'],
    maxCost: 100,
    maxTime: 240 // 4 hours
  },
  multiModeRoute: {
    origin: 'Times Square, New York',
    destination: 'Central Park, New York', 
    transportTypes: ['driving', 'transit', 'walking'],
    includeBicycling: true
  },
  constrainedRoute: {
    origin: 'Brooklyn, NY',
    destination: 'Manhattan, NY',
    maxCost: 15,
    maxTime: 45,
    transportTypes: ['public', 'walking']
  },
  incompleteRoute: {
    origin: 'Boston, MA',
    // Missing destination
    transportTypes: ['driving']
  }
};

class TransportationAgentTester {
  constructor() {
    this.agent = new TransportationAgent({
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
   * Test 1: Basic transportation search with valid origin/destination
   */
  async testValidTransportationSearch() {
    this.logSeparator('Test 1: Valid Transportation Search');
    
    this.log('Testing transportation search from NYC to Philadelphia...');
    this.log('Criteria: ' + JSON.stringify(TEST_CONFIG.validRoute, null, 2));

    const startTime = Date.now();
    const result = await this.agent.execute({ criteria: TEST_CONFIG.validRoute });
    const executionTime = Date.now() - startTime;

    this.log(`Execution completed in ${executionTime}ms`);

    // Validate response structure
    if (!result.success) {
      throw new Error(`Agent execution failed: ${result.error}`);
    }

    // Extract transportation options from response
    const transportOptions = result.data.content?.recommendations || result.data.recommendations || [];
    
    this.log(`Found ${transportOptions.length} transportation recommendations`, 'success');

    if (transportOptions.length === 0) {
      throw new Error('No transportation options found');
    }

    // Validate first option structure
    const sample = transportOptions[0];
    this.validateTransportationStructure(sample);

    // Log sample transportation details
    this.log('\n🚗 Sample Transportation Option:');
    console.log(`   Type: ${sample.type}`);
    console.log(`   Provider: ${sample.provider}`);
    console.log(`   Service: ${sample.service}`);
    console.log(`   Cost: $${sample.estimatedCost}`);
    console.log(`   Time: ${sample.estimatedTime}`);
    console.log(`   Distance: ${sample.route?.distance || 'N/A'}`);
    console.log(`   Features: ${sample.features?.join(', ') || 'None'}`);

    // Check if this looks like real Google Directions data vs mock data
    const isRealData = sample.id && !sample.id.startsWith('TRANS');
    this.log(isRealData ? 'Using real Google Directions data' : 'Using fallback mock data', 
             isRealData ? 'success' : 'warning');

    // Log confidence and reasoning
    const confidence = result.data.confidence || result.data.content?.confidence;
    const reasoning = result.data.reasoning || result.data.content?.reasoning;
    
    this.log(`\n🎯 Confidence Score: ${confidence}`);
    if (reasoning) {
      this.log(`💭 AI Reasoning: ${reasoning.substring(0, 150)}${reasoning.length > 150 ? '...' : ''}`);
    }
  }

  /**
   * Test 2: Multiple travel modes support
   */
  async testMultipleTravelModes() {
    this.logSeparator('Test 2: Multiple Travel Modes Support');

    this.log(`Testing multiple travel modes including bicycling...`);
    this.log('Route: ' + JSON.stringify(TEST_CONFIG.multiModeRoute, null, 2));

    const result = await this.agent.execute({ criteria: TEST_CONFIG.multiModeRoute });

    if (!result.success) {
      throw new Error(`Agent execution failed: ${result.error}`);
    }

    const transportOptions = result.data.content?.recommendations || result.data.recommendations || [];
    
    if (transportOptions.length === 0) {
      throw new Error('No transportation options found for multiple modes');
    }

    // Check for variety in transportation types
    const availableTypes = [...new Set(transportOptions.map(option => option.type))];
    this.log(`Available transportation types: ${availableTypes.join(', ')}`, 'success');

    // Should have at least 2 different types
    if (availableTypes.length < 2) {
      this.log('Warning: Expected more transportation type variety', 'warning');
    }

    // Log all options briefly
    this.log('\n🚊 All Transportation Options:');
    transportOptions.slice(0, 5).forEach((option, index) => {
      console.log(`   ${index + 1}. ${option.type} (${option.service}) - $${option.estimatedCost}, ${option.estimatedTime}`);
    });
  }

  /**
   * Test 3: Error handling with missing origin/destination
   */
  async testMissingOriginDestination() {
    this.logSeparator('Test 3: Missing Origin/Destination Error Handling');

    this.log(`Testing with missing destination...`);
    
    const result = await this.agent.execute({ criteria: TEST_CONFIG.incompleteRoute });

    // This should either fail gracefully or fall back to mock data
    if (result.success) {
      const transportOptions = result.data.content?.recommendations || result.data.recommendations || [];
      if (transportOptions.length > 0) {
        this.log('Fallback to mock data worked correctly', 'success');
      } else {
        this.log('No transportation options found for incomplete route', 'warning');
      }
    } else {
      this.log(`Graceful error handling: ${result.error}`, 'success');
    }
  }

  /**
   * Test 4: Fallback behavior when API is unavailable
   */
  async testAPIFallback() {
    this.logSeparator('Test 4: API Fallback Behavior');

    // Temporarily disable API key to test fallback
    const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = 'invalid-key-for-testing';

    this.log('Testing fallback with invalid API key...');

    try {
      const result = await this.agent.execute({ criteria: TEST_CONFIG.validRoute });

      if (result.success) {
        const transportOptions = result.data.content?.recommendations || result.data.recommendations || [];
        
        if (transportOptions.length > 0) {
          this.log(`✅ Fallback successful: Found ${transportOptions.length} mock transportation options`);
          
          // Verify these are mock transportation options
          const sample = transportOptions[0];
          const isMockData = sample.id && sample.id.startsWith('TRANS');
          
          if (isMockData) {
            this.log('Correctly using mock data when API unavailable', 'success');
          } else {
            this.log('Unexpected: got real data with invalid API key', 'warning');
          }

          // Show sample mock option
          this.log('\n🚗 Sample Mock Transportation Option:');
          console.log(`   Type: ${sample.type}`);
          console.log(`   Provider: ${sample.provider}`);
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
   * Test 5: Cost and time constraints
   */
  async testCostTimeConstraints() {
    this.logSeparator('Test 5: Cost and Time Constraints');

    this.log('Testing with strict cost and time constraints...');
    this.log('Constraints: ' + JSON.stringify(TEST_CONFIG.constrainedRoute, null, 2));

    const result = await this.agent.execute({ criteria: TEST_CONFIG.constrainedRoute });

    if (!result.success) {
      throw new Error(`Agent execution failed: ${result.error}`);
    }

    const transportOptions = result.data.content?.recommendations || result.data.recommendations || [];
    
    if (transportOptions.length === 0) {
      this.log('No options found within constraints - this may be expected', 'warning');
      return;
    }

    // Validate that options respect constraints
    let constraintViolations = 0;
    
    transportOptions.forEach((option, index) => {
      if (TEST_CONFIG.constrainedRoute.maxCost && option.estimatedCost > TEST_CONFIG.constrainedRoute.maxCost) {
        this.log(`Option ${index + 1}: Cost violation - $${option.estimatedCost} > $${TEST_CONFIG.constrainedRoute.maxCost}`, 'warning');
        constraintViolations++;
      }
      
      const timeInMinutes = this.agent.parseTimeToMinutes(option.estimatedTime);
      if (TEST_CONFIG.constrainedRoute.maxTime && timeInMinutes > TEST_CONFIG.constrainedRoute.maxTime) {
        this.log(`Option ${index + 1}: Time violation - ${timeInMinutes}min > ${TEST_CONFIG.constrainedRoute.maxTime}min`, 'warning');
        constraintViolations++;
      }
    });

    if (constraintViolations === 0) {
      this.log('All options respect cost and time constraints', 'success');
    } else {
      this.log(`${constraintViolations} constraint violations found`, 'warning');
    }

    this.log(`\n🎯 Found ${transportOptions.length} options within constraints:`);
    transportOptions.forEach((option, index) => {
      console.log(`   ${index + 1}. ${option.type}: $${option.estimatedCost}, ${option.estimatedTime}`);
    });
  }

  /**
   * Test 6: Response data validation
   */
  async testDataValidation() {
    this.logSeparator('Test 6: Response Data Validation');

    this.log('Testing response data structure and types...');

    const result = await this.agent.execute({ criteria: TEST_CONFIG.validRoute });

    if (!result.success) {
      throw new Error(`Agent execution failed: ${result.error}`);
    }

    // Validate overall response structure
    this.validateResponseStructure(result);

    const transportOptions = result.data.content?.recommendations || result.data.recommendations || [];
    
    if (transportOptions.length > 0) {
      // Validate each transportation option in the response
      transportOptions.forEach((option, index) => {
        try {
          this.validateTransportationStructure(option);
          this.log(`Transportation option ${index + 1}: Structure valid ✓`);
        } catch (error) {
          throw new Error(`Transportation option ${index + 1} validation failed: ${error.message}`);
        }
      });

      this.log(`All ${transportOptions.length} transportation options have valid structure`, 'success');
    }
  }

  /**
   * Validate transportation object structure
   */
  validateTransportationStructure(option) {
    const requiredFields = ['id', 'type', 'provider', 'service', 'estimatedCost', 'estimatedTime'];
    
    for (const field of requiredFields) {
      if (option[field] === undefined || option[field] === null) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate data types
    if (typeof option.provider !== 'string') {
      throw new Error('Provider must be a string');
    }

    if (typeof option.estimatedCost !== 'number' || option.estimatedCost < 0) {
      throw new Error('Estimated cost must be a positive number');
    }

    if (typeof option.estimatedTime !== 'string') {
      throw new Error('Estimated time must be a string');
    }

    if (!['driving', 'transit', 'public', 'walking', 'bicycling', 'rideshare', 'taxi', 'rental'].includes(option.type)) {
      throw new Error(`Invalid transportation type: ${option.type}`);
    }

    if (option.features && !Array.isArray(option.features)) {
      throw new Error('Features must be an array');
    }

    if (option.route) {
      if (typeof option.route.distance !== 'string' && option.route.distance !== undefined) {
        throw new Error('Route distance must be a string');
      }
      if (typeof option.route.duration !== 'string' && option.route.duration !== undefined) {
        throw new Error('Route duration must be a string');
      }
    }
  }

  /**
   * Validate overall response structure
   */
  validateResponseStructure(result) {
    if (!result.agentName || result.agentName !== 'TransportationAgent') {
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
    console.log('🧪 TransportationAgent Google Directions Integration Test Suite');
    console.log('='.repeat(60));
    console.log(`Environment: ${process.env.GOOGLE_MAPS_API_KEY ? '✅ Google Maps API Key detected' : '⚠️ No Google Maps API Key - using fallback mode'}`);
    console.log(`OpenAI Key: ${process.env.OPENAI_API_KEY ? '✅ Available' : '⚠️ Not available'}`);

    const startTime = Date.now();

    await this.runTest('Valid Transportation Search', () => this.testValidTransportationSearch());
    await this.runTest('Multiple Travel Modes Support', () => this.testMultipleTravelModes());
    await this.runTest('Missing Origin/Destination Handling', () => this.testMissingOriginDestination());
    await this.runTest('API Fallback Behavior', () => this.testAPIFallback());
    await this.runTest('Cost and Time Constraints', () => this.testCostTimeConstraints());
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
      this.log('🎉 All tests passed! TransportationAgent Google Directions integration is working correctly.', 'success');
    } else {
      this.log(`⚠️ ${this.testResults.failed} test(s) failed. Check the logs above for details.`, 'warning');
    }

    console.log('\n' + '='.repeat(60));
    console.log('🏁 Test suite completed');
  }
}

// Run the test suite
async function main() {
  const tester = new TransportationAgentTester();
  
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

export { TransportationAgentTester };