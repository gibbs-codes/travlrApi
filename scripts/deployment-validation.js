#!/usr/bin/env node
// deployment-validation.js - Comprehensive deployment validation suite
// Validates API health, performance, database connectivity, and production readiness

import fetch from 'node-fetch';
import { runAllTests } from '../test-api-mvp.js';
import fs from 'fs';
import path from 'path';

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const PERFORMANCE_TIMEOUT = 30000; // 30 seconds max for trip creation
const CONCURRENT_REQUESTS = 5;
const BENCHMARK_ITERATIONS = 3;

// Utilities
function log(message, emoji = '📋') {
  const timestamp = new Date().toISOString();
  console.log(`${emoji} [${timestamp}] ${message}`);
}

function success(message) { log(message, '✅'); }
function error(message) { log(message, '❌'); }
function warning(message) { log(message, '⚠️'); }
function info(message) { log(message, 'ℹ️'); }
function performance(message) { log(message, '⚡'); }
function security(message) { log(message, '🔒'); }

class DeploymentValidator {
  constructor() {
    this.results = {
      healthChecks: [],
      apiTests: [],
      performanceTests: [],
      databaseTests: [],
      securityTests: [],
      environmentChecks: []
    };
    this.startTime = Date.now();
  }

  async validateEnvironment() {
    log('🔍 Environment Configuration Validation', '🔧');
    
    const requiredEnvVars = [
      'NODE_ENV',
      'MONGODB_URI',
      'PORT'
    ];

    const optionalEnvVars = [
      'OPENAI_API_KEY',
      'AMADEUS_CLIENT_ID',
      'GOOGLE_MAPS_API_KEY',
      'RAPIDAPI_KEY'
    ];

    let envScore = 0;
    const totalRequired = requiredEnvVars.length;

    // Check required environment variables
    for (const envVar of requiredEnvVars) {
      if (process.env[envVar]) {
        success(`Required: ${envVar} is set`);
        envScore++;
      } else {
        error(`Required: ${envVar} is missing`);
      }
    }

    // Check optional environment variables
    let optionalCount = 0;
    for (const envVar of optionalEnvVars) {
      if (process.env[envVar]) {
        info(`Optional: ${envVar} is configured`);
        optionalCount++;
      } else {
        warning(`Optional: ${envVar} not configured (may limit functionality)`);
      }
    }

    const envCheck = {
      name: 'Environment Configuration',
      passed: envScore === totalRequired,
      score: `${envScore}/${totalRequired} required, ${optionalCount}/${optionalEnvVars.length} optional`,
      details: {
        required: envScore,
        totalRequired,
        optional: optionalCount,
        totalOptional: optionalEnvVars.length
      }
    };

    this.results.environmentChecks.push(envCheck);
    return envCheck.passed;
  }

  async validateDatabaseConnectivity() {
    log('🗄️ Database Connectivity Tests', '🔧');
    
    try {
      const response = await fetch(`${API_BASE}/health`, { timeout: 5000 });
      const data = await response.json();

      if (data.database?.isConnected) {
        success(`Database connected: ${data.database.name} at ${data.database.host}:${data.database.port}`);
        info(`Connection state: ${data.database.readyState} (1=connected)`);

        const dbTest = {
          name: 'Database Connectivity',
          passed: true,
          details: data.database
        };
        this.results.databaseTests.push(dbTest);
        return true;
      } else {
        error('Database connection failed');
        const dbTest = {
          name: 'Database Connectivity',
          passed: false,
          error: 'Database not connected'
        };
        this.results.databaseTests.push(dbTest);
        return false;
      }
    } catch (err) {
      error(`Database connectivity error: ${err.message}`);
      const dbTest = {
        name: 'Database Connectivity',
        passed: false,
        error: err.message
      };
      this.results.databaseTests.push(dbTest);
      return false;
    }
  }

  async validateAPIHealth() {
    log('🏥 API Health Checks', '🔧');
    
    const healthChecks = [
      {
        name: 'Basic Health Check',
        test: async () => {
          const response = await fetch(`${API_BASE}/health`);
          const data = await response.json();
          return response.ok && data.status === 'OK';
        }
      },
      {
        name: 'Response Time Check',
        test: async () => {
          const start = Date.now();
          const response = await fetch(`${API_BASE}/health`);
          const duration = Date.now() - start;
          
          if (duration > 2000) {
            warning(`Health endpoint slow: ${duration}ms`);
            return false;
          } else {
            info(`Health endpoint response time: ${duration}ms`);
            return true;
          }
        }
      },
      {
        name: 'CORS Headers Check',
        test: async () => {
          const response = await fetch(`${API_BASE}/health`, {
            headers: { 'Origin': 'http://localhost:3000' }
          });
          const corsHeader = response.headers.get('access-control-allow-origin');
          
          if (corsHeader) {
            success(`CORS enabled: ${corsHeader}`);
            return true;
          } else {
            warning('CORS headers not found (may cause frontend issues)');
            return false;
          }
        }
      }
    ];

    let passedChecks = 0;
    for (const check of healthChecks) {
      try {
        const passed = await check.test();
        const result = {
          name: check.name,
          passed,
          timestamp: new Date().toISOString()
        };
        this.results.healthChecks.push(result);
        
        if (passed) {
          passedChecks++;
          success(check.name);
        } else {
          error(check.name);
        }
      } catch (err) {
        error(`${check.name}: ${err.message}`);
        this.results.healthChecks.push({
          name: check.name,
          passed: false,
          error: err.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    return passedChecks === healthChecks.length;
  }

  async validateAPIEndpoints() {
    log('🚀 API Endpoint Tests', '🔧');
    
    try {
      const apiTestResult = await runAllTests();
      this.results.apiTests.push({
        name: 'MVP API Test Suite',
        passed: apiTestResult,
        timestamp: new Date().toISOString()
      });
      
      if (apiTestResult) {
        success('All API endpoints working correctly');
      } else {
        error('Some API endpoints failed');
      }
      
      return apiTestResult;
    } catch (err) {
      error(`API endpoint tests failed: ${err.message}`);
      this.results.apiTests.push({
        name: 'MVP API Test Suite',
        passed: false,
        error: err.message,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }

  async validatePerformance() {
    log('⚡ Performance Benchmarking', '🔧');
    
    const performanceTests = [
      {
        name: 'Trip Creation Performance',
        test: async () => {
          const tripRequest = {
            title: "Performance Test Trip",
            destination: "Tokyo",
            origin: "San Francisco",
            departureDate: "2025-12-01",
            returnDate: "2025-12-07",
            travelers: { count: 2, adults: 2, children: 0, infants: 0 },
            preferences: {
              interests: ["cultural", "food"],
              budget: { total: 3000, currency: "USD" }
            },
            collaboration: { createdBy: "perf_test" }
          };

          const times = [];
          
          for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
            const start = Date.now();
            
            try {
              const response = await fetch(`${API_BASE}/api/trip/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tripRequest),
                timeout: PERFORMANCE_TIMEOUT
              });
              
              const data = await response.json();
              const duration = Date.now() - start;
              times.push(duration);
              
              if (data.success) {
                performance(`Trip creation ${i + 1}: ${duration}ms`);
              } else {
                error(`Trip creation ${i + 1} failed: ${data.error}`);
                return false;
              }
            } catch (err) {
              error(`Trip creation ${i + 1} timeout/error: ${err.message}`);
              return false;
            }
          }

          const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
          const maxTime = Math.max(...times);
          const minTime = Math.min(...times);

          performance(`Performance summary: avg=${avgTime.toFixed(0)}ms, min=${minTime}ms, max=${maxTime}ms`);

          // Trip creation should complete within 5 seconds for API response
          const acceptable = maxTime < 5000;
          if (acceptable) {
            success('Trip creation performance acceptable');
          } else {
            warning(`Trip creation too slow: ${maxTime}ms (target: <5000ms)`);
          }

          return {
            passed: acceptable,
            metrics: { avgTime, maxTime, minTime, iterations: BENCHMARK_ITERATIONS }
          };
        }
      },
      {
        name: 'Concurrent Request Handling',
        test: async () => {
          const requests = Array(CONCURRENT_REQUESTS).fill(null).map(async (_, i) => {
            const start = Date.now();
            try {
              const response = await fetch(`${API_BASE}/health`);
              const duration = Date.now() - start;
              return { success: response.ok, duration, index: i };
            } catch (err) {
              return { success: false, error: err.message, index: i };
            }
          });

          const results = await Promise.all(requests);
          const successful = results.filter(r => r.success).length;
          const avgResponseTime = results
            .filter(r => r.success)
            .reduce((sum, r) => sum + r.duration, 0) / successful;

          performance(`Concurrent requests: ${successful}/${CONCURRENT_REQUESTS} successful`);
          performance(`Average response time under load: ${avgResponseTime.toFixed(0)}ms`);

          const passed = successful === CONCURRENT_REQUESTS && avgResponseTime < 2000;
          
          return {
            passed,
            metrics: {
              successful,
              total: CONCURRENT_REQUESTS,
              avgResponseTime,
              results
            }
          };
        }
      }
    ];

    let passedTests = 0;
    for (const test of performanceTests) {
      try {
        const result = await test.test();
        const testResult = {
          name: test.name,
          passed: result.passed,
          metrics: result.metrics,
          timestamp: new Date().toISOString()
        };
        this.results.performanceTests.push(testResult);
        
        if (result.passed) {
          passedTests++;
        }
      } catch (err) {
        error(`${test.name}: ${err.message}`);
        this.results.performanceTests.push({
          name: test.name,
          passed: false,
          error: err.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    return passedTests === performanceTests.length;
  }

  async validateSecurity() {
    log('🔒 Security Validation', '🔧');
    
    const securityTests = [
      {
        name: 'Security Headers Check',
        test: async () => {
          const response = await fetch(`${API_BASE}/health`);
          const securityHeaders = [
            'x-frame-options',
            'x-content-type-options',
            'x-xss-protection'
          ];
          
          let foundHeaders = 0;
          for (const header of securityHeaders) {
            if (response.headers.get(header)) {
              foundHeaders++;
              info(`Security header present: ${header}`);
            } else {
              warning(`Security header missing: ${header}`);
            }
          }
          
          return foundHeaders >= 2; // At least 2 out of 3 security headers
        }
      },
      {
        name: 'Error Information Leakage',
        test: async () => {
          // Test with invalid endpoint to check error responses
          const response = await fetch(`${API_BASE}/api/nonexistent`);
          const data = await response.json();
          
          // Check if error response leaks sensitive information
          const responseText = JSON.stringify(data).toLowerCase();
          const sensitiveTerms = ['password', 'secret', 'key', 'token', 'stack'];
          
          for (const term of sensitiveTerms) {
            if (responseText.includes(term) && process.env.NODE_ENV === 'production') {
              warning(`Potential information leakage in error response: ${term}`);
              return false;
            }
          }
          
          return true;
        }
      }
    ];

    let passedTests = 0;
    for (const test of securityTests) {
      try {
        const passed = await test.test();
        this.results.securityTests.push({
          name: test.name,
          passed,
          timestamp: new Date().toISOString()
        });
        
        if (passed) {
          passedTests++;
          security(`${test.name}: PASS`);
        } else {
          warning(`${test.name}: FAIL`);
        }
      } catch (err) {
        error(`${test.name}: ${err.message}`);
        this.results.securityTests.push({
          name: test.name,
          passed: false,
          error: err.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    return passedTests === securityTests.length;
  }

  generateReport() {
    const duration = Date.now() - this.startTime;
    const report = {
      timestamp: new Date().toISOString(),
      duration: `${(duration / 1000).toFixed(2)}s`,
      environment: process.env.NODE_ENV || 'unknown',
      apiBase: API_BASE,
      summary: {
        healthChecks: {
          total: this.results.healthChecks.length,
          passed: this.results.healthChecks.filter(t => t.passed).length
        },
        apiTests: {
          total: this.results.apiTests.length,
          passed: this.results.apiTests.filter(t => t.passed).length
        },
        performanceTests: {
          total: this.results.performanceTests.length,
          passed: this.results.performanceTests.filter(t => t.passed).length
        },
        databaseTests: {
          total: this.results.databaseTests.length,
          passed: this.results.databaseTests.filter(t => t.passed).length
        },
        securityTests: {
          total: this.results.securityTests.length,
          passed: this.results.securityTests.filter(t => t.passed).length
        },
        environmentChecks: {
          total: this.results.environmentChecks.length,
          passed: this.results.environmentChecks.filter(t => t.passed).length
        }
      },
      results: this.results
    };

    // Calculate overall pass rate
    const totalTests = Object.values(report.summary).reduce((sum, category) => sum + category.total, 0);
    const totalPassed = Object.values(report.summary).reduce((sum, category) => sum + category.passed, 0);
    const passRate = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0;

    report.overallResult = {
      passed: totalPassed,
      total: totalTests,
      passRate: `${passRate}%`,
      deploymentReady: passRate >= 80 // 80% pass rate required for deployment
    };

    return report;
  }

  async saveReport(report) {
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `deployment-validation-${timestamp}.json`;
    const filepath = path.join(reportsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    info(`Report saved: ${filepath}`);
  }

  printSummary(report) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 DEPLOYMENT VALIDATION SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`⏱️  Duration: ${report.duration}`);
    console.log(`🌐 Environment: ${report.environment}`);
    console.log(`🔗 API Base: ${report.apiBase}`);
    console.log(`📈 Overall Pass Rate: ${report.overallResult.passRate}`);
    
    console.log('\n📋 Test Categories:');
    Object.entries(report.summary).forEach(([category, stats]) => {
      const status = stats.passed === stats.total ? '✅' : stats.passed > 0 ? '⚠️' : '❌';
      console.log(`${status} ${category}: ${stats.passed}/${stats.total}`);
    });

    console.log('\n🚀 Deployment Readiness:');
    if (report.overallResult.deploymentReady) {
      success('✅ READY FOR DEPLOYMENT');
      console.log('   All critical systems validated successfully.');
    } else {
      error('❌ NOT READY FOR DEPLOYMENT');
      console.log('   Critical issues found. Review failed tests above.');
      console.log(`   Minimum pass rate: 80%, Current: ${report.overallResult.passRate}`);
    }

    console.log('\n💡 Next Steps:');
    if (report.overallResult.deploymentReady) {
      console.log('   • Review performance metrics for optimization opportunities');
      console.log('   • Configure monitoring and alerting for production');
      console.log('   • Set up automated deployment pipeline');
    } else {
      console.log('   • Fix failing tests identified above');
      console.log('   • Ensure all required environment variables are set');
      console.log('   • Re-run validation after fixes');
    }
  }
}

async function main() {
  console.log('🔧 TravlrAPI Deployment Validation Suite');
  console.log('=========================================\n');

  const validator = new DeploymentValidator();

  try {
    // Run all validation steps
    const results = await Promise.allSettled([
      validator.validateEnvironment(),
      validator.validateDatabaseConnectivity(),
      validator.validateAPIHealth(),
      validator.validateAPIEndpoints(),
      validator.validatePerformance(),
      validator.validateSecurity()
    ]);

    // Generate and display report
    const report = validator.generateReport();
    await validator.saveReport(report);
    validator.printSummary(report);

    // Exit with appropriate code
    process.exit(report.overallResult.deploymentReady ? 0 : 1);

  } catch (error) {
    console.error('💥 Validation suite crashed:', error);
    process.exit(1);
  }
}

// Run validation if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { DeploymentValidator };