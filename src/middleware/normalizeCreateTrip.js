export const normalizeCreateTrip = (req, _res, next) => {
  req.body = req.body || {};
  req.body.preferences = req.body.preferences || {};

  const preferences = req.body.preferences;

  preferences.budget = preferences.budget || {
    total: 1500,
    currency: 'USD',
    breakdown: {
      flight: 500,
      accommodation: 700,
      food: 200,
      activities: 100
    }
  };

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

  if (!req.body.budget) {
    req.body.budget = {
      total: preferences.budget.total,
      currency: preferences.budget.currency,
      flight: preferences.budget.breakdown.flight,
      accommodation: preferences.budget.breakdown.accommodation,
      food: preferences.budget.breakdown.food,
      activities: preferences.budget.breakdown.activities
    };
  }

  next();
};

export default normalizeCreateTrip;
