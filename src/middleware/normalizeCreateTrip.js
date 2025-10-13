export const normalizeCreateTrip = (req, _res, next) => {
  req.body = req.body || {};
  req.body.preferences = req.body.preferences || {};

  const preferences = req.body.preferences;

  // **FIX: Read from preferences.budget if it exists**
  const budgetSource = preferences.budget || req.body.budget || {};
  
  const budgetTotal = budgetSource.total || 1500;
  const budgetBreakdown = budgetSource.breakdown || {
    flight: 500,
    accommodation: 700,
    food: 200,
    activities: 100
  };

  // Normalize budget structure
  preferences.budget = {
    total: budgetTotal,
    currency: budgetSource.currency || 'USD',
    breakdown: budgetBreakdown
  };

  // **FIX: Also set at root level for controller compatibility**
  req.body.budget = {
    total: budgetTotal,
    currency: budgetSource.currency || 'USD',
    ...budgetBreakdown  // Flatten breakdown
  };

  // Set other defaults...
  preferences.accommodation = preferences.accommodation || {
    type: 'hotel',
    minRating: 3
  };

  preferences.transportation = preferences.transportation || {
    flightClass: 'economy',
    preferNonStop: true
  };

  preferences.dining = preferences.dining || {
    priceRange: 'mid_range'
  };

  next();
};

export default normalizeCreateTrip;
