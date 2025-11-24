/**
 * Agent Type Constants
 *
 * Single source of truth for all agent types across the application.
 * If adding a new agent type, update this file only.
 */

export const AGENT_TYPES = {
  FLIGHT: 'flight',
  ACCOMMODATION: 'accommodation',
  RESTAURANT: 'restaurant',
  ACTIVITY: 'activity'
};

export const AGENT_TYPE_LIST = Object.values(AGENT_TYPES);

/**
 * Validate if a given string is a valid agent type
 * @param {string} type - The type to validate
 * @returns {boolean}
 */
export function isValidAgentType(type) {
  return AGENT_TYPE_LIST.includes(type);
}

/**
 * Validate an array of agent types
 * @param {string[]} types - Array of types to validate
 * @returns {{ valid: boolean, invalid: string[] }}
 */
export function validateAgentTypes(types) {
  if (!Array.isArray(types)) {
    return { valid: false, invalid: [] };
  }

  const invalid = types.filter(type => !isValidAgentType(type));
  return {
    valid: invalid.length === 0,
    invalid
  };
}
