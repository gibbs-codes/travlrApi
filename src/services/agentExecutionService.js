/**
 * Agent Execution Service
 *
 * Handles the complex logic of executing agents and normalizing results
 */

import logger from '../utils/logger.js';
const log = logger.child({ scope: 'AgentExecutionService' });

// ===== RESULT NORMALIZATION =====

export function normalizeRankedResults(rankedResults) {
  if (!rankedResults) return [];

  // Handle array of results
  if (Array.isArray(rankedResults)) {
    return rankedResults.map(item => ({
      ...item,
      confidence: item.confidence ?? item.score ?? 0.5,
    }));
  }

  // Handle nested structure
  if (rankedResults.recommendations) {
    return normalizeRankedResults(rankedResults.recommendations);
  }

  return [];
}

export function normalizeRawResults(rawResults, fallbackType) {
  if (!rawResults) return [];

  if (Array.isArray(rawResults)) {
    return rawResults;
  }

  // Check various possible nesting locations
  if (rawResults.recommendations) {
    return normalizeRawResults(rawResults.recommendations, fallbackType);
  }

  if (rawResults.results) {
    return normalizeRawResults(rawResults.results, fallbackType);
  }

  if (rawResults.data) {
    return normalizeRawResults(rawResults.data, fallbackType);
  }

  // Single result object
  if (rawResults.title || rawResults.name) {
    return [rawResults];
  }

  return [];
}

export function normalizeAgentResults(results, agentType) {
  // Try ranked results first (orchestrator output)
  if (results.rankedRecommendations) {
    const normalized = normalizeRankedResults(results.rankedRecommendations);
    log.info(`Normalized ${normalized.length} ranked results for ${agentType}`);
    return { success: true, recommendations: normalized };
  }

  // Try raw results (independent agent output)
  if (results.rawRecommendations) {
    const normalized = normalizeRawResults(results.rawRecommendations, agentType);
    log.info(`Normalized ${normalized.length} raw results for ${agentType}`);
    return { success: true, recommendations: normalized };
  }

  // Try results array directly
  if (results.results || Array.isArray(results)) {
    const normalized = normalizeRawResults(results, agentType);
    log.info(`Normalized ${normalized.length} direct results for ${agentType}`);
    return { success: true, recommendations: normalized };
  }

  log.warn(`No results found for ${agentType}`, { resultKeys: Object.keys(results || {}) });
  return { success: false, recommendations: [] };
}

// ===== EXECUTION PATHS =====

export async function executeViaOrchestrator(agentType, tripContext, orchestrator) {
  log.info(`Executing ${agentType} via orchestrator`);

  try {
    const result = await orchestrator.executeAgent(agentType, tripContext);
    return {
      success: true,
      result,
      executionMethod: 'orchestrator'
    };
  } catch (error) {
    log.error(`Orchestrator execution failed for ${agentType}: ${error.message}`);
    return {
      success: false,
      error: error.message,
      executionMethod: 'orchestrator'
    };
  }
}

export async function executeIndependently(agentType, tripContext, agentClass) {
  log.info(`Executing ${agentType} independently`);

  try {
    const agent = new agentClass();
    const result = await agent.generateRecommendations(tripContext);
    return {
      success: true,
      result,
      executionMethod: 'independent'
    };
  } catch (error) {
    log.error(`Independent execution failed for ${agentType}: ${error.message}`);
    return {
      success: false,
      error: error.message,
      executionMethod: 'independent'
    };
  }
}

// ===== ERROR HANDLING =====

export function createErrorResponse(agentType, error, context = {}) {
  return {
    success: false,
    error: 'Agent execution failed',
    message: `Failed to execute ${agentType} agent: ${error.message || error}`,
    details: {
      agentType,
      errorMessage: error.message || String(error),
      ...context,
    },
    timestamp: new Date().toISOString(),
  };
}

export function createSuccessResponse(agentType, recommendations, metadata = {}) {
  return {
    success: true,
    data: {
      agentType,
      recommendations,
      total: recommendations.length,
      ...metadata,
    },
    message: `${agentType} recommendations retrieved successfully`,
    timestamp: new Date().toISOString(),
  };
}
