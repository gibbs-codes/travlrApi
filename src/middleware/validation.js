// Validation middleware for TravlrAPI
// Provides structured input validation and error formatting

export const validateTripCreation = (req, res, next) => {
  const errors = [];
  const { body } = req;

  // Required fields
  const requiredFields = {
    destination: 'string',
    origin: 'string', 
    departureDate: 'string'
  };

  for (const [field, expectedType] of Object.entries(requiredFields)) {
    if (!body[field]) {
      errors.push(`${field} is required`);
    } else if (typeof body[field] !== expectedType) {
      errors.push(`${field} must be a ${expectedType}`);
    }
  }

  // Date validation
  if (body.departureDate) {
    const depDate = new Date(body.departureDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (isNaN(depDate.getTime())) {
      errors.push('departureDate must be a valid date');
    } else if (depDate < today) {
      errors.push('departureDate cannot be in the past');
    }
  }

  if (body.returnDate) {
    const retDate = new Date(body.returnDate);
    const depDate = new Date(body.departureDate);
    
    if (isNaN(retDate.getTime())) {
      errors.push('returnDate must be a valid date');
    } else if (retDate <= depDate) {
      errors.push('returnDate must be after departureDate');
    }
  }

  // Travelers validation
  if (body.travelers) {
    if (typeof body.travelers === 'number') {
      if (body.travelers < 1 || body.travelers > 20) {
        errors.push('travelers must be between 1 and 20');
      }
    } else if (typeof body.travelers === 'object') {
      const { adults = 1, children = 0, infants = 0 } = body.travelers;
      if (adults + children + infants < 1 || adults + children + infants > 20) {
        errors.push('total travelers must be between 1 and 20');
      }
      if (adults < 1) {
        errors.push('at least 1 adult traveler is required');
      }
    }
  }

  // Budget validation
  if (body.budget && typeof body.budget === 'object') {
    const { total, ...categories } = body.budget;
    
    if (total !== undefined && (typeof total !== 'number' || total < 0)) {
      errors.push('budget.total must be a positive number');
    }

    for (const [category, amount] of Object.entries(categories)) {
      if (amount !== undefined && (typeof amount !== 'number' || amount < 0)) {
        errors.push(`budget.${category} must be a positive number`);
      }
    }
  }

  // Preferences validation
  if (body.preferences && typeof body.preferences !== 'object') {
    errors.push('preferences must be an object');
  }

  // Interests validation
  if (body.interests && !Array.isArray(body.interests)) {
    errors.push('interests must be an array');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors,
      message: 'Please check your input and try again'
    });
  }

  next();
};

export const validateTripId = (req, res, next) => {
  const { tripId } = req.params;
  
  if (!tripId || typeof tripId !== 'string' || tripId.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid trip ID',
      message: 'Trip ID is required and must be a valid string'
    });
  }

  next();
};

export const validateSelections = (req, res, next) => {
  const errors = [];
  const { selections, selectedBy } = req.body;

  if (!selections || typeof selections !== 'object') {
    errors.push('selections object is required');
  } else {
    const validCategories = ['flight', 'accommodation', 'activity', 'restaurant', 'transportation'];
    
    for (const [category, recommendationIds] of Object.entries(selections)) {
      if (!validCategories.includes(category)) {
        errors.push(`invalid category: ${category}`);
        continue;
      }
      
      if (!Array.isArray(recommendationIds)) {
        errors.push(`${category} selections must be an array`);
        continue;
      }
      
      for (const id of recommendationIds) {
        if (typeof id !== 'string' || id.trim().length === 0) {
          errors.push(`${category} contains invalid recommendation ID`);
          break;
        }
      }
    }
  }

  if (selectedBy !== undefined && typeof selectedBy !== 'string') {
    errors.push('selectedBy must be a string');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Selection validation failed',
      details: errors,
      message: 'Please check your selections and try again'
    });
  }

  next();
};

export const validateAgentRetrigger = (req, res, next) => {
  const errors = [];
  const { agents, reason } = req.body;

  if (agents !== undefined) {
    if (!Array.isArray(agents)) {
      errors.push('agents must be an array');
    } else {
      const validAgents = ['flight', 'accommodation', 'activity', 'restaurant', 'transportation'];
      
      for (const agent of agents) {
        if (!validAgents.includes(agent)) {
          errors.push(`invalid agent: ${agent}`);
        }
      }
    }
  }

  if (reason !== undefined && typeof reason !== 'string') {
    errors.push('reason must be a string');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Retrigger validation failed',
      details: errors,
      message: 'Please check your request and try again'
    });
  }

  next();
};

export const validatePagination = (req, res, next) => {
  const { limit, offset } = req.query;

  if (limit !== undefined) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Invalid limit parameter',
        message: 'Limit must be a number between 1 and 100'
      });
    }
    req.query.limit = limitNum;
  }

  if (offset !== undefined) {
    const offsetNum = parseInt(offset);
    if (isNaN(offsetNum) || offsetNum < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid offset parameter',
        message: 'Offset must be a non-negative number'
      });
    }
    req.query.offset = offsetNum;
  }

  next();
};

// Error formatting middleware
export const formatError = (error, req, res, next) => {
  console.error(`API Error [${req.method} ${req.path}]:`, error);

  // Database/Mongoose errors
  if (error.name === 'ValidationError') {
    const validationErrors = Object.values(error.errors).map(err => err.message);
    return res.status(400).json({
      success: false,
      error: 'Database validation failed',
      details: validationErrors,
      message: 'Please check your data and try again'
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'Invalid ID format',
      message: 'The provided ID is not valid'
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      error: 'Duplicate entry',
      message: 'A record with this information already exists'
    });
  }

  // Connection errors
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return res.status(503).json({
      success: false,
      error: 'Service unavailable',
      message: 'Unable to connect to required services. Please try again later.'
    });
  }

  // Default error response
  res.status(error.status || 500).json({
    success: false,
    error: error.message || 'Internal server error',
    message: 'An unexpected error occurred. Please try again later.',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

// Success response formatter
export const formatSuccess = (data, message = 'Request successful', metadata = {}) => {
  return {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
    ...metadata
  };
};

// Async wrapper to handle promise rejections
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};