export const getDestinations = async (req, res) => {
  try {
    const destinations = [
      { id: 1, name: 'Paris', country: 'France', description: 'City of Light' },
      { id: 2, name: 'Tokyo', country: 'Japan', description: 'Modern metropolis' },
      { id: 3, name: 'New York', country: 'USA', description: 'The Big Apple' }
    ];
    
    res.json({ success: true, data: destinations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};