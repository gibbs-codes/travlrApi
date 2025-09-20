# Frontend Integration Guide

## Overview

This guide provides everything frontend developers need to integrate with the TravlrAPI MVP. The API follows RESTful conventions and returns consistent JSON responses.

## Quick Start

### Base Configuration

```javascript
// API Configuration
const API_CONFIG = {
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000',
  timeout: 30000, // 30 seconds for trip creation
  headers: {
    'Content-Type': 'application/json',
    // Add authentication headers when implemented
  }
};

// Create API client
const apiClient = axios.create(API_CONFIG);
```

### Response Format

All endpoints return a consistent response format:

```typescript
interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string[];
  message: string;
}
```

## Essential API Calls

### 1. Health Check

Use this to verify API connectivity and database status.

```javascript
// Check API health
async function checkAPIHealth() {
  try {
    const response = await apiClient.get('/health');
    return {
      isHealthy: response.data.status === 'OK',
      databaseConnected: response.data.database?.isConnected || false
    };
  } catch (error) {
    console.error('Health check failed:', error);
    return { isHealthy: false, databaseConnected: false };
  }
}

// Usage
const health = await checkAPIHealth();
if (!health.isHealthy) {
  // Show offline/maintenance message
}
```

### 2. Create Trip

Main trip creation workflow with orchestrator execution.

```javascript
// Trip creation with full orchestrator execution
async function createTrip(tripData) {
  const tripRequest = {
    title: tripData.title || `Trip to ${tripData.destination}`,
    destination: tripData.destination,
    origin: tripData.origin,
    departureDate: tripData.departureDate, // 'YYYY-MM-DD'
    returnDate: tripData.returnDate,       // 'YYYY-MM-DD' or null
    travelers: {
      count: tripData.travelers || 1,
      adults: tripData.adults || 1,
      children: tripData.children || 0,
      infants: tripData.infants || 0
    },
    preferences: {
      interests: tripData.interests || ['cultural', 'food'],
      budget: {
        total: tripData.budget,
        currency: tripData.currency || 'USD',
        breakdown: tripData.budgetBreakdown || {}
      },
      accommodation: {
        type: tripData.accommodationType || 'any',
        minRating: tripData.minHotelRating || 3,
        requiredAmenities: tripData.amenities || []
      },
      transportation: {
        flightClass: tripData.flightClass || 'economy',
        preferNonStop: tripData.preferNonStop || false
      },
      dining: {
        dietaryRestrictions: tripData.dietaryRestrictions || [],
        cuisinePreferences: tripData.cuisines || [],
        priceRange: tripData.diningBudget || 'mixed'
      }
    },
    collaboration: {
      createdBy: tripData.userId || 'anonymous'
    },
    triggerOrchestrator: true // Set to false for draft creation
  };

  try {
    const response = await apiClient.post('/api/trip/create', tripRequest);
    
    if (response.data.success) {
      return {
        success: true,
        tripId: response.data.data.tripId,
        status: response.data.data.status,
        agentExecution: response.data.data.agentExecution
      };
    } else {
      throw new Error(response.data.error || 'Trip creation failed');
    }
  } catch (error) {
    console.error('Trip creation error:', error);
    throw error;
  }
}

// Usage Example
const newTrip = await createTrip({
  destination: 'Paris',
  origin: 'New York',
  departureDate: '2025-12-15',
  returnDate: '2025-12-20',
  travelers: 2,
  budget: 3000,
  interests: ['cultural', 'food', 'art'],
  flightClass: 'economy',
  userId: 'user123'
});
```

### 3. Poll Trip Status

Monitor trip planning progress with real-time updates.

```javascript
// Status polling for live updates
class TripStatusPoller {
  constructor(tripId, onStatusUpdate) {
    this.tripId = tripId;
    this.onStatusUpdate = onStatusUpdate;
    this.polling = false;
    this.pollInterval = null;
  }

  async pollStatus() {
    try {
      const response = await apiClient.get(`/api/trip/${this.tripId}/status`);
      
      if (response.data.success) {
        const statusData = response.data.data;
        this.onStatusUpdate(statusData);
        
        // Stop polling when complete
        if (['recommendations_ready', 'cancelled', 'failed'].includes(statusData.status)) {
          this.stopPolling();
        }
        
        return statusData;
      }
    } catch (error) {
      console.error('Status polling error:', error);
      this.onStatusUpdate({ error: error.message });
    }
  }

  startPolling(intervalMs = 3000) {
    if (this.polling) return;
    
    this.polling = true;
    this.pollInterval = setInterval(() => {
      this.pollStatus();
    }, intervalMs);
    
    // Initial poll
    this.pollStatus();
  }

  stopPolling() {
    this.polling = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}

// Usage
const poller = new TripStatusPoller(tripId, (status) => {
  console.log('Trip status update:', status);
  
  // Update UI based on status
  updateProgressBar(status.execution?.agents);
  updateRecommendationCounts(status.recommendationCounts);
  
  if (status.status === 'recommendations_ready') {
    // Trip planning complete - fetch full details
    loadTripDetails(tripId);
  }
});

poller.startPolling();
```

### 4. Load Trip Details

Fetch complete trip information with recommendations.

```javascript
// Load full trip details including recommendations
async function loadTripDetails(tripId) {
  try {
    const response = await apiClient.get(`/api/trip/${tripId}`);
    
    if (response.data.success) {
      const trip = response.data.data;
      
      return {
        tripInfo: {
          id: trip.tripId,
          title: trip.title,
          destination: trip.destination,
          origin: trip.origin,
          dates: trip.dates,
          travelers: trip.travelers,
          status: trip.status
        },
        recommendations: trip.recommendations,
        selectedRecommendations: trip.selectedRecommendations,
        metadata: {
          totalRecommendations: trip.totalRecommendations,
          totalSelected: trip.totalSelectedRecommendations
        }
      };
    } else {
      throw new Error(response.data.error || 'Failed to load trip');
    }
  } catch (error) {
    console.error('Load trip error:', error);
    throw error;
  }
}

// Usage
const tripDetails = await loadTripDetails(tripId);
console.log(`Loaded ${tripDetails.metadata.totalRecommendations} recommendations`);
```

### 5. Select Recommendations

Handle user recommendation selections.

```javascript
// Update user's recommendation selections
async function selectRecommendations(tripId, selections, userId = 'user') {
  const selectionRequest = {
    selections: {
      flight: selections.flight || [],
      accommodation: selections.accommodation || [],
      activity: selections.activity || [],
      restaurant: selections.restaurant || [],
      transportation: selections.transportation || []
    },
    selectedBy: userId
  };

  try {
    const response = await apiClient.put(`/api/trip/${tripId}/select`, selectionRequest);
    
    if (response.data.success) {
      return {
        success: true,
        selections: response.data.data.selectedRecommendations,
        totalSelected: response.data.data.totalSelected
      };
    } else {
      throw new Error(response.data.error || 'Selection failed');
    }
  } catch (error) {
    console.error('Selection error:', error);
    throw error;
  }
}

// Usage - select specific recommendations
const result = await selectRecommendations(tripId, {
  flight: ['recommendation_id_1'],
  accommodation: ['recommendation_id_2', 'recommendation_id_3'],
  activity: ['recommendation_id_4']
}, 'user123');
```

### 6. Rerun Agents

Refresh recommendations when needed.

```javascript
// Rerun specific agents for updated recommendations
async function rerunAgents(tripId, agentList = [], reason = 'User requested refresh') {
  const rerunRequest = {
    agents: agentList, // Empty array = all agents
    reason: reason,
    resetSelections: false // Keep existing selections
  };

  try {
    const response = await apiClient.post(`/api/trip/${tripId}/rerun`, rerunRequest);
    
    if (response.data.success) {
      return {
        success: true,
        retriggeredAgents: response.data.data.retriggeredAgents,
        estimatedDuration: response.data.data.estimatedDuration
      };
    } else {
      throw new Error(response.data.error || 'Rerun failed');
    }
  } catch (error) {
    console.error('Rerun error:', error);
    throw error;
  }
}

// Usage - rerun just flight and accommodation agents
const rerunResult = await rerunAgents(tripId, ['flight', 'accommodation'], 'User wants more budget options');
```

## React Hook Examples

### Custom Hook for Trip Management

```javascript
// Custom React hook for trip management
import { useState, useEffect, useCallback } from 'react';

export function useTrip(tripId = null) {
  const [trip, setTrip] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [poller, setPoller] = useState(null);

  // Create new trip
  const createTrip = useCallback(async (tripData) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await createTripAPI(tripData);
      setTrip(result);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Load trip details
  const loadTrip = useCallback(async (id) => {
    if (!id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const tripDetails = await loadTripDetails(id);
      setTrip(tripDetails);
      return tripDetails;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Start status polling
  const startStatusPolling = useCallback((id) => {
    if (poller) poller.stopPolling();
    
    const newPoller = new TripStatusPoller(id, (statusUpdate) => {
      setStatus(statusUpdate);
      
      if (statusUpdate.status === 'recommendations_ready') {
        loadTrip(id); // Refresh trip details
      }
    });
    
    newPoller.startPolling();
    setPoller(newPoller);
  }, [poller, loadTrip]);

  // Stop status polling
  const stopStatusPolling = useCallback(() => {
    if (poller) {
      poller.stopPolling();
      setPoller(null);
    }
  }, [poller]);

  // Select recommendations
  const selectRecommendations = useCallback(async (selections, userId) => {
    if (!trip?.tripInfo?.id) return;
    
    try {
      const result = await selectRecommendationsAPI(trip.tripInfo.id, selections, userId);
      // Refresh trip to get updated selections
      await loadTrip(trip.tripInfo.id);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [trip, loadTrip]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (poller) poller.stopPolling();
    };
  }, [poller]);

  // Auto-load trip if ID provided
  useEffect(() => {
    if (tripId) {
      loadTrip(tripId);
    }
  }, [tripId, loadTrip]);

  return {
    trip,
    status,
    loading,
    error,
    createTrip,
    loadTrip,
    startStatusPolling,
    stopStatusPolling,
    selectRecommendations,
    isPolling: !!poller
  };
}

// Usage in component
function TripPlannerComponent() {
  const { 
    trip, 
    status, 
    loading, 
    error, 
    createTrip, 
    startStatusPolling,
    selectRecommendations 
  } = useTrip();

  const handleCreateTrip = async (formData) => {
    try {
      const newTrip = await createTrip(formData);
      startStatusPolling(newTrip.tripId);
    } catch (error) {
      // Handle error
    }
  };

  // ... component logic
}
```

## Error Handling

### Common Error Patterns

```javascript
// Centralized error handling
function handleAPIError(error) {
  if (error.response?.data) {
    const { error: errorMessage, details, message } = error.response.data;
    
    // Validation errors
    if (details && Array.isArray(details)) {
      return {
        type: 'validation',
        message: 'Please check your input',
        details: details
      };
    }
    
    // Server errors
    if (error.response.status >= 500) {
      return {
        type: 'server',
        message: 'Server error - please try again later'
      };
    }
    
    // Client errors
    return {
      type: 'client',
      message: errorMessage || message || 'Request failed'
    };
  }
  
  // Network errors
  if (error.code === 'NETWORK_ERROR') {
    return {
      type: 'network',
      message: 'Please check your internet connection'
    };
  }
  
  // Timeout errors
  if (error.code === 'TIMEOUT') {
    return {
      type: 'timeout',
      message: 'Request timed out - please try again'
    };
  }
  
  return {
    type: 'unknown',
    message: error.message || 'An unexpected error occurred'
  };
}

// Usage
try {
  await createTrip(tripData);
} catch (error) {
  const errorInfo = handleAPIError(error);
  
  switch (errorInfo.type) {
    case 'validation':
      showValidationErrors(errorInfo.details);
      break;
    case 'network':
      showOfflineMessage();
      break;
    case 'timeout':
      showRetryOption();
      break;
    default:
      showGenericError(errorInfo.message);
  }
}
```

## Performance Optimization

### Caching Strategies

```javascript
// Simple in-memory cache for trip data
class TripCache {
  constructor(ttl = 300000) { // 5 minutes default TTL
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  get(key) {
    const item = this.cache.get(key);
    
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  clear() {
    this.cache.clear();
  }
}

const tripCache = new TripCache();

// Cache-aware trip loading
async function loadTripWithCache(tripId) {
  const cacheKey = `trip_${tripId}`;
  const cached = tripCache.get(cacheKey);
  
  if (cached) {
    console.log('Returning cached trip data');
    return cached;
  }
  
  const trip = await loadTripDetails(tripId);
  tripCache.set(cacheKey, trip);
  
  return trip;
}
```

### Request Debouncing

```javascript
// Debounced status polling to reduce server load
function createDebouncedPoller(tripId, onUpdate, delay = 1000) {
  let timeoutId;
  
  const debouncedPoll = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(async () => {
      const status = await pollTripStatus(tripId);
      onUpdate(status);
      
      if (status.status === 'in_progress') {
        debouncedPoll(); // Continue polling
      }
    }, delay);
  };
  
  return {
    start: debouncedPoll,
    stop: () => clearTimeout(timeoutId)
  };
}
```

## TypeScript Support

### Type Definitions

```typescript
// Core types for TypeScript projects
export interface TripRequest {
  title?: string;
  destination: string;
  origin: string;
  departureDate: string;
  returnDate?: string;
  travelers: number | TravelerDetails;
  preferences?: TripPreferences;
  collaboration: CollaborationInfo;
  triggerOrchestrator?: boolean;
}

export interface TravelerDetails {
  count: number;
  adults: number;
  children: number;
  infants: number;
  details?: TravelerInfo[];
}

export interface TravelerInfo {
  name?: string;
  age?: number;
  type: 'adult' | 'child' | 'infant';
}

export interface TripPreferences {
  interests?: InterestType[];
  budget?: BudgetPreferences;
  accommodation?: AccommodationPreferences;
  transportation?: TransportationPreferences;
  dining?: DiningPreferences;
  accessibility?: AccessibilityPreferences;
}

export type InterestType = 
  | 'cultural' | 'food' | 'adventure' | 'relaxation' 
  | 'nightlife' | 'nature' | 'shopping' | 'history' 
  | 'art' | 'sports' | 'photography' | 'wellness';

export type TripStatus = 
  | 'draft' | 'planning' | 'recommendations_ready' 
  | 'user_selecting' | 'finalized' | 'cancelled';

export type AgentStatus = 
  | 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface Recommendation {
  _id: string;
  type: 'flight' | 'accommodation' | 'activity' | 'restaurant' | 'transportation';
  title: string;
  description: string;
  provider: string;
  confidence: number;
  pricing: {
    amount: number;
    currency: string;
    priceCategory: 'budget' | 'mid_range' | 'luxury';
  };
  metadata: Record<string, any>;
  selection: {
    isSelected: boolean;
    selectedAt?: string;
    selectedBy?: string;
  };
  createdAt: string;
}

export interface TripDetails {
  tripInfo: {
    id: string;
    title: string;
    destination: LocationInfo;
    origin: LocationInfo;
    dates: DateInfo;
    travelers: TravelerDetails;
    status: TripStatus;
  };
  recommendations: {
    flight: Recommendation[];
    accommodation: Recommendation[];
    activity: Recommendation[];
    restaurant: Recommendation[];
    transportation: Recommendation[];
  };
  selectedRecommendations: Record<string, SelectedRecommendation[]>;
  metadata: {
    totalRecommendations: number;
    totalSelected: number;
  };
}

// API client with types
class TypedAPIClient {
  async createTrip(request: TripRequest): Promise<{ tripId: string; status: TripStatus }> {
    // Implementation
  }

  async getTripDetails(tripId: string): Promise<TripDetails> {
    // Implementation
  }

  async getTripStatus(tripId: string): Promise<TripStatusResponse> {
    // Implementation
  }

  // ... other methods
}
```

## Security Considerations

### Request Validation

```javascript
// Client-side validation helpers
export function validateTripRequest(data) {
  const errors = [];
  
  if (!data.destination?.trim()) {
    errors.push('Destination is required');
  }
  
  if (!data.origin?.trim()) {
    errors.push('Origin is required');
  }
  
  if (!data.departureDate) {
    errors.push('Departure date is required');
  } else if (new Date(data.departureDate) < new Date()) {
    errors.push('Departure date cannot be in the past');
  }
  
  if (data.returnDate && new Date(data.returnDate) < new Date(data.departureDate)) {
    errors.push('Return date must be after departure date');
  }
  
  if (!data.travelers || (typeof data.travelers === 'number' && data.travelers < 1)) {
    errors.push('At least one traveler is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
```

### Content Security

```javascript
// Sanitize user input before sending to API
import DOMPurify from 'dompurify';

export function sanitizeTripData(data) {
  return {
    ...data,
    title: data.title ? DOMPurify.sanitize(data.title.trim()) : undefined,
    destination: DOMPurify.sanitize(data.destination.trim()),
    origin: DOMPurify.sanitize(data.origin.trim()),
    // ... other string fields
  };
}
```

## Testing Integration

### API Mocks for Development

```javascript
// Mock API responses for development/testing
export const mockAPIResponses = {
  createTrip: {
    success: true,
    data: {
      tripId: 'trip_mock_123',
      status: 'planning',
      title: 'Mock Trip to Paris',
      // ... other fields
    },
    message: 'Trip created successfully, planning in progress'
  },
  
  tripStatus: {
    success: true,
    data: {
      tripId: 'trip_mock_123',
      status: 'recommendations_ready',
      execution: {
        status: 'completed',
        agents: {
          flight: 'completed',
          accommodation: 'completed',
          activity: 'completed',
          restaurant: 'completed',
          transportation: 'completed'
        }
      },
      recommendationCounts: {
        flight: 3,
        accommodation: 5,
        activity: 8,
        restaurant: 6,
        transportation: 2
      }
    }
  }
};

// Mock API client for testing
export class MockAPIClient {
  async createTrip(data) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate delay
    return mockAPIResponses.createTrip;
  }
  
  async getTripStatus(tripId) {
    await new Promise(resolve => setTimeout(resolve, 500));
    return mockAPIResponses.tripStatus;
  }
  
  // ... other mock methods
}
```

## Troubleshooting

### Common Issues and Solutions

1. **CORS Errors**
   - Ensure the API server includes your frontend domain in CORS configuration
   - Check that preflight requests are handled correctly

2. **Long Request Timeouts**
   - Trip creation can take 15-30 seconds due to AI agent execution
   - Implement proper loading states and progress indicators
   - Use status polling instead of waiting for the initial response

3. **Polling Performance**
   - Don't poll faster than every 2-3 seconds
   - Stop polling when trip status reaches a final state
   - Implement exponential backoff on errors

4. **Recommendation Loading**
   - Full trip details can be large - consider pagination for recommendations
   - Cache trip data appropriately to reduce API calls
   - Use optimistic updates for user selections

5. **Error Handling**
   - Always implement retry logic for network errors
   - Show user-friendly error messages
   - Provide fallback options when possible

---

For additional support or questions about API integration, please refer to the OpenAPI specification in `/docs/openapi.yaml` or contact the development team.