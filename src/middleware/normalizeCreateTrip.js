export const normalizeCreateTrip = (req, _res, next) => {
  req.body = req.body || {};
  req.body.preferences = req.body.preferences || {};

  const preferences = req.body.preferences;

  // Remove legacy cost payloads to keep requests lean
  delete req.body.budget;
  delete preferences.budget;

  // Set other defaults...
  preferences.accommodation = preferences.accommodation || {
    type: 'hotel',
    minRating: 3
  };

  preferences.transportation = preferences.transportation || {
    flightClass: 'economy',
    preferNonStop: true
  };

  preferences.dining = preferences.dining || {};

  next();
};

export default normalizeCreateTrip;
