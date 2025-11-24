import mongoose from 'mongoose';
import { AGENT_TYPE_LIST } from '../constants/agentTypes.js';

const recommendationSchema = new mongoose.Schema({
  agentType: {
    type: String,
    required: true,
    enum: [...AGENT_TYPE_LIST, 'transportation'], // transportation is future feature
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  price: {
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      required: true,
      default: 'USD',
      uppercase: true,
      minlength: 3,
      maxlength: 3
    },
    priceType: {
      type: String,
      enum: ['per_person', 'per_room', 'per_night', 'per_group', 'total'],
      default: 'per_person'
    }
  },
  rating: {
    score: {
      type: Number,
      min: 0,
      max: 5
    },
    reviewCount: {
      type: Number,
      min: 0,
      default: 0
    },
    source: {
      type: String,
      trim: true
    }
  },
  location: {
    address: {
      type: String,
      trim: true
    },
    city: {
      type: String,
      trim: true
    },
    country: {
      type: String,
      trim: true
    },
    coordinates: {
      lat: {
        type: Number,
        min: -90,
        max: 90
      },
      lng: {
        type: Number,
        min: -180,
        max: 180
      }
    },
    placeId: {
      type: String,
      trim: true
    }
  },
  selection: {
    isSelected: {
      type: Boolean,
      default: false,
      index: true
    },
    selectionRank: {
      type: Number,
      min: 1
    },
    selectedAt: {
      type: Date
    },
    selectedBy: {
      type: String,
      trim: true
    }
  },
  confidence: {
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },
    reasoning: {
      type: String,
      maxlength: 1000
    },
    factors: [{
      factor: {
        type: String,
        required: true
      },
      weight: {
        type: Number,
        min: 0,
        max: 1
      },
      score: {
        type: Number,
        min: 0,
        max: 1
      }
    }]
  },
  agentMetadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  externalIds: {
    bookingId: String,
    googlePlaceId: String,
    amadeusId: String,
    rapidApiId: String,
    providerId: String
  },
  availability: {
    isAvailable: {
      type: Boolean,
      default: true
    },
    availabilityCheckedAt: {
      type: Date,
      default: Date.now
    },
    bookingUrl: {
      type: String,
      trim: true
    }
  },
  images: [{
    url: {
      type: String,
      required: true,
      trim: true
    },
    alt: {
      type: String,
      trim: true
    },
    isPrimary: {
      type: Boolean,
      default: false
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

recommendationSchema.virtual('formattedPrice').get(function() {
  return `${this.price.currency} ${this.price.amount.toFixed(2)}`;
});

recommendationSchema.virtual('confidencePercentage').get(function() {
  return Math.round(this.confidence.score * 100);
});

recommendationSchema.index({ agentType: 1, 'confidence.score': -1 });
recommendationSchema.index({ 'selection.isSelected': 1, 'selection.selectionRank': 1 });
recommendationSchema.index({ 'price.amount': 1 });
recommendationSchema.index({ 'rating.score': -1 });

export default mongoose.model('Recommendation', recommendationSchema);