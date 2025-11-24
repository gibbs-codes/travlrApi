import mongoose from 'mongoose';

const PlaceSchema = new mongoose.Schema({
  googlePlaceId: { type: String, unique: true, index: true, required: true },
  displayName: { type: String, required: true },
  lat: Number,
  lng: Number,
  countryCode: String,
  level: { type: String, enum: ['poi', 'locality', 'admin_area', 'country'], default: 'poi' },
  types: [String],
  providerIds: {
    type: Map,
    of: String,
    default: {}
  },
  confidence: {
    type: Map,
    of: Number,
    default: {}
  }
}, { timestamps: true });

const Place = mongoose.model('Place', PlaceSchema);

export default Place;
