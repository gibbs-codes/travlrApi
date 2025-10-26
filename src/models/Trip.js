import mongoose from 'mongoose';

const sharingSchema = new mongoose.Schema({
  isEnabled: {
    type: Boolean,
    default: false
  },
  shareableLink: {
    type: String,
    default: null,
    unique: true,
    sparse: true
  },
  linkExpiration: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: null
  },
  accessCount: {
    type: Number,
    default: 0
  },
  lastAccessedAt: {
    type: Date,
    default: null
  }
}, { _id: false, id: false });

const tripSchema = new mongoose.Schema({
  tripId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: () => `trip_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  destination: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    country: {
      type: String,
      trim: true
    },
    coordinates: {
      latitude: Number,
      longitude: Number
    },
    placeId: {
      type: String,
      trim: true
    }
  },
  origin: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    country: {
      type: String,
      trim: true
    },
    coordinates: {
      latitude: Number,
      longitude: Number
    },
    airportCode: {
      type: String,
      uppercase: true,
      minlength: 3,
      maxlength: 3
    }
  },
  dates: {
    departureDate: {
      type: Date,
      required: true,
      index: true
    },
    returnDate: {
      type: Date,
      validate: {
        validator: function(value) {
          return !value || value >= this.dates.departureDate;
        },
        message: 'Return date must be after departure date'
      }
    },
    duration: {
      type: Number,
      min: 1
    }
  },
  travelers: {
    count: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
      default: 1
    },
    adults: {
      type: Number,
      min: 1,
      default: 1
    },
    children: {
      type: Number,
      min: 0,
      default: 0
    },
    infants: {
      type: Number,
      min: 0,
      default: 0
    },
    details: [{
      name: {
        type: String,
        trim: true
      },
      age: {
        type: Number,
        min: 0,
        max: 120
      },
      type: {
        type: String,
        enum: ['adult', 'child', 'infant'],
        default: 'adult'
      }
    }]
  },
  preferences: {
    interests: [{
      type: String,
      enum: ['cultural', 'food', 'adventure', 'relaxation', 'nightlife', 'nature', 'shopping', 'history', 'art', 'sports', 'photography', 'wellness']
    }],
    budget: {
      total: {
        type: Number,
        min: 0
      },
      currency: {
        type: String,
        default: 'USD',
        uppercase: true,
        minlength: 3,
        maxlength: 3
      },
      breakdown: {
        flight: {
          type: Number,
          min: 0
        },
        accommodation: {
          type: Number,
          min: 0
        },
        food: {
          type: Number,
          min: 0
        },
        activities: {
          type: Number,
          min: 0
        },
        transportation: {
          type: Number,
          min: 0
        },
        miscellaneous: {
          type: Number,
          min: 0
        }
      }
    },
    accommodation: {
      type: {
        type: String,
        enum: ['hotel', 'resort', 'apartment', 'hostel', 'guesthouse', 'villa', 'any'],
        default: 'any'
      },
      minRating: {
        type: Number,
        min: 1,
        max: 5,
        default: 3
      },
      requiredAmenities: [{
        type: String,
        enum: ['wifi', 'parking', 'pool', 'gym', 'spa', 'restaurant', 'bar', 'room_service', 'concierge', 'business_center']
      }]
    },
    transportation: {
      flightClass: {
        type: String,
        enum: ['economy', 'premium_economy', 'business', 'first'],
        default: 'economy'
      },
      preferNonStop: {
        type: Boolean,
        default: false
      },
      localTransport: {
        type: String,
        enum: ['public', 'taxi', 'rental_car', 'walking', 'mixed'],
        default: 'mixed'
      }
    },
    dining: {
      dietaryRestrictions: [{
        type: String,
        enum: ['vegetarian', 'vegan', 'gluten_free', 'halal', 'kosher', 'nut_free', 'dairy_free']
      }],
      cuisinePreferences: [{
        type: String
      }],
      priceRange: {
        type: String,
        enum: ['budget', 'mid_range', 'fine_dining', 'mixed'],
        default: 'mixed'
      }
    },
    accessibility: {
      mobilityAssistance: {
        type: Boolean,
        default: false
      },
      wheelchairAccessible: {
        type: Boolean,
        default: false
      },
      visualAssistance: {
        type: Boolean,
        default: false
      },
      hearingAssistance: {
        type: Boolean,
        default: false
      }
    }
  },
  recommendations: {
    flight: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Recommendation'
    }],
    accommodation: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Recommendation'
    }],
    activity: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Recommendation'
    }],
    restaurant: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Recommendation'
    }],
    transportation: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Recommendation'
    }]
  },
  selectedRecommendations: {
    flight: [{
      recommendation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Recommendation'
      },
      selectedAt: {
        type: Date,
        default: Date.now
      },
      selectedBy: {
        type: String,
        trim: true
      }
    }],
    accommodation: [{
      recommendation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Recommendation'
      },
      selectedAt: {
        type: Date,
        default: Date.now
      },
      selectedBy: {
        type: String,
        trim: true
      }
    }],
    activity: [{
      recommendation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Recommendation'
      },
      selectedAt: {
        type: Date,
        default: Date.now
      },
      selectedBy: {
        type: String,
        trim: true
      }
    }],
    restaurant: [{
      recommendation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Recommendation'
      },
      selectedAt: {
        type: Date,
        default: Date.now
      },
      selectedBy: {
        type: String,
        trim: true
      }
    }],
    transportation: [{
      recommendation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Recommendation'
      },
      selectedAt: {
        type: Date,
        default: Date.now
      },
      selectedBy: {
        type: String,
        trim: true
      }
    }]
  },
  agentExecution: {
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'failed', 'partial'],
      default: 'pending',
      index: true
    },
    startedAt: {
      type: Date
    },
    completedAt: {
      type: Date
    },
    totalDuration: {
      type: Number
    },
    agents: {
      flight: {
        status: {
          type: String,
          enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
          default: 'pending'
        },
        startedAt: Date,
        completedAt: Date,
        duration: Number,
        confidence: {
          type: Number,
          min: 0,
          max: 1
        },
        recommendationCount: {
          type: Number,
          min: 0,
          default: 0
        },
        errors: [{
          message: String,
          timestamp: {
            type: Date,
            default: Date.now
          },
          stack: String
        }]
      },
      accommodation: {
        status: {
          type: String,
          enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
          default: 'pending'
        },
        startedAt: Date,
        completedAt: Date,
        duration: Number,
        confidence: {
          type: Number,
          min: 0,
          max: 1
        },
        recommendationCount: {
          type: Number,
          min: 0,
          default: 0
        },
        errors: [{
          message: String,
          timestamp: {
            type: Date,
            default: Date.now
          },
          stack: String
        }]
      },
      activity: {
        status: {
          type: String,
          enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
          default: 'pending'
        },
        startedAt: Date,
        completedAt: Date,
        duration: Number,
        confidence: {
          type: Number,
          min: 0,
          max: 1
        },
        recommendationCount: {
          type: Number,
          min: 0,
          default: 0
        },
        errors: [{
          message: String,
          timestamp: {
            type: Date,
            default: Date.now
          },
          stack: String
        }]
      },
      restaurant: {
        status: {
          type: String,
          enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
          default: 'pending'
        },
        startedAt: Date,
        completedAt: Date,
        duration: Number,
        confidence: {
          type: Number,
          min: 0,
          max: 1
        },
        recommendationCount: {
          type: Number,
          min: 0,
          default: 0
        },
        errors: [{
          message: String,
          timestamp: {
            type: Date,
            default: Date.now
          },
          stack: String
        }]
      }
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  collaboration: {
    createdBy: {
      type: String,
      required: true,
      trim: true
    },
    collaborators: [{
      userId: {
        type: String,
        required: true,
        trim: true
      },
      role: {
        type: String,
        enum: ['owner', 'editor', 'viewer'],
        default: 'viewer'
      },
      addedAt: {
        type: Date,
        default: Date.now
      },
      addedBy: {
        type: String,
        trim: true
      },
      permissions: {
        canEdit: {
          type: Boolean,
          default: false
        },
        canInvite: {
          type: Boolean,
          default: false
        },
        canDelete: {
          type: Boolean,
          default: false
        }
      }
    }],
    isPublic: {
      type: Boolean,
      default: false
    },
    shareToken: {
      type: String,
      unique: true,
      sparse: true
    }
  },
  sharing: {
    type: sharingSchema,
    default: () => ({
      isEnabled: false,
      shareableLink: null,
      linkExpiration: null,
      createdAt: null,
      accessCount: 0,
      lastAccessedAt: null
    })
  },
  status: {
    type: String,
    enum: ['draft', 'planning', 'recommendations_ready', 'user_selecting', 'finalized', 'cancelled'],
    default: 'draft',
    index: true
  },
  version: {
    type: Number,
    default: 1
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  notes: {
    type: String,
    maxlength: 5000
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

tripSchema.virtual('totalSelectedRecommendations').get(function() {
  const selections = this.selectedRecommendations || {};
  return Object.values(selections).reduce((total, category = []) => total + (category?.length || 0), 0);
});

tripSchema.virtual('totalRecommendations').get(function() {
  const stored = this.recommendations || {};
  return Object.values(stored).reduce((total, category = []) => total + (category?.length || 0), 0);
});

tripSchema.virtual('durationDays').get(function() {
  if (!this.dates.returnDate) return 1;
  const diffTime = Math.abs(this.dates.returnDate - this.dates.departureDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

tripSchema.virtual('estimatedBudget').get(function() {
  const breakdown = this.preferences?.budget?.breakdown;
  if (!breakdown) return 0;
  return Object.values(breakdown).reduce((sum, amount) => sum + (amount || 0), 0);
});

tripSchema.virtual('isShareLinkActive').get(function() {
  const sharing = this.sharing || this.collaboration?.sharing;
  const isEnabled = Boolean(sharing?.isEnabled);
  if (!isEnabled || !sharing?.shareableLink) return false;
  if (!sharing.linkExpiration) return true; // No expiration set
  return new Date() < sharing.linkExpiration;
});

tripSchema.pre('save', function(next) {
  if (this.dates.departureDate && this.dates.returnDate) {
    const diffTime = Math.abs(this.dates.returnDate - this.dates.departureDate);
    this.dates.duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  if (this.travelers.adults || this.travelers.children || this.travelers.infants) {
    this.travelers.count = (this.travelers.adults || 0) + (this.travelers.children || 0) + (this.travelers.infants || 0);
  }
  
  next();
});

tripSchema.index({ 'collaboration.createdBy': 1, status: 1 });
tripSchema.index({ 'destination.name': 1 });
tripSchema.index({ status: 1, updatedAt: -1 });
tripSchema.index({ 'collaboration.collaborators.userId': 1 });
tripSchema.index({ tags: 1 });
tripSchema.index({ 'sharing.isEnabled': 1, 'sharing.linkExpiration': 1 });

export default mongoose.model('Trip', tripSchema);
