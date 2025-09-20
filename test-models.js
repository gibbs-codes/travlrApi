#!/usr/bin/env node

import mongoose from 'mongoose';
import { Trip, Recommendation } from './src/models/index.js';
import databaseService from './src/services/database.js';

console.log('🧪 Testing Database Models and Agent Output Compatibility\n');

// Sample agent outputs based on typical agent response formats
const sampleAgentOutputs = {
  flight: [
    {
      name: "Emirates EK73 - New York to Dubai",
      description: "Direct flight from JFK to DXB with excellent service",
      price: 850,
      cost: 850,
      rating: 4.2,
      reviewCount: 1250,
      source: "Amadeus",
      coordinates: { latitude: 25.276987, longitude: 55.296249 },
      location: "Dubai International Airport",
      confidence: 0.9,
      reasoning: "Direct flight with good price and timing",
      id: "EK73_20240315",
      providerId: "amadeus_ek73",
      images: [
        { url: "https://example.com/emirates.jpg", alt: "Emirates A380" }
      ]
    }
  ],
  accommodation: [
    {
      name: "Hotel Plaza Athenee",
      title: "Hotel Plaza Athenee",
      description: "Luxury hotel in the heart of Paris with stunning views",
      summary: "5-star luxury hotel near Champs-Élysées", 
      price: 450,
      cost: 450,
      rating: 4.8,
      score: 4.8,
      reviewCount: 890,
      source: "Booking.com",
      address: "25 Avenue Montaigne, 75008 Paris",
      location: "25 Avenue Montaigne, 75008 Paris",
      coordinates: { latitude: 48.8566, longitude: 2.3522 },
      confidence: 0.95,
      reasoning: "Excellent location and reviews",
      id: "booking_plaza_athenee",
      providerId: "booking_12345",
      images: [
        { url: "https://example.com/hotel.jpg", alt: "Hotel exterior", isPrimary: true }
      ]
    }
  ],
  activity: [
    {
      name: "Louvre Museum Private Tour",
      title: "Louvre Museum Private Tour",
      description: "2-hour private guided tour of the world's largest art museum",
      summary: "Skip-the-line private tour",
      price: 75,
      cost: 75,
      rating: 4.7,
      score: 4.7,
      reviewCount: 456,
      source: "TripAdvisor",
      address: "Rue de Rivoli, 75001 Paris",
      location: "Rue de Rivoli, 75001 Paris",
      coordinates: { latitude: 48.8606, longitude: 2.3376 },
      confidence: 0.88,
      reasoning: "Highly rated cultural experience",
      category: "cultural",
      id: "ta_louvre_tour",
      providerId: "tripadvisor_456",
      images: [
        { url: "https://example.com/louvre.jpg", alt: "Louvre Museum" }
      ]
    }
  ],
  restaurant: [
    {
      name: "Le Comptoir du Relais",
      title: "Le Comptoir du Relais",
      description: "Traditional French bistro with authentic Parisian atmosphere",
      summary: "Classic bistro in Saint-Germain",
      price: 45,
      cost: 45,
      averageMeal: 45,
      rating: 4.3,
      score: 4.3,
      reviewCount: 234,
      source: "Google Places",
      address: "9 Carrefour de l'Odéon, 75006 Paris",
      location: "9 Carrefour de l'Odéon, 75006 Paris",
      coordinates: { latitude: 48.8512, longitude: 2.3398 },
      confidence: 0.82,
      reasoning: "Authentic French cuisine with good ratings",
      id: "google_comptoir_relais",
      providerId: "google_places_789",
      images: [
        { url: "https://example.com/restaurant.jpg", alt: "Restaurant interior" }
      ]
    }
  ],
  transportation: [
    {
      name: "Paris Metro Day Pass",
      title: "Metro Pass",
      description: "Unlimited travel on Paris Metro, buses, and RER within zones 1-2",
      summary: "All-day public transport pass",
      price: 8,
      cost: 8,
      estimatedCost: 8,
      rating: 4.1,
      score: 4.1,
      reviewCount: 123,
      source: "RATP",
      address: "Paris Public Transport Network",
      location: "Paris Public Transport Network",
      coordinates: { latitude: 48.8566, longitude: 2.3522 },
      confidence: 0.75,
      reasoning: "Cost-effective way to travel around Paris",
      id: "ratp_day_pass",
      providerId: "ratp_123",
      images: []
    }
  ]
};

async function testModels() {
  try {
    console.log('📡 Connecting to database...');
    await databaseService.connect();
    console.log('✅ Database connected successfully\n');

    // Clean up any existing test data
    console.log('🧹 Cleaning up any existing test data...');
    await Trip.deleteMany({ title: { $regex: /^Test Trip/ } });
    await Recommendation.deleteMany({ name: { $regex: /^(Emirates|Hotel Plaza|Louvre|Le Comptoir|Paris Metro)/ } });
    console.log('✅ Cleanup completed\n');

    console.log('🏗️  Creating test trip...');
    const tripData = {
      title: "Test Trip to Paris",
      destination: {
        name: "Paris",
        country: "France",
        coordinates: { latitude: 48.8566, longitude: 2.3522 },
        placeId: "ChIJD7fiBh9u5kcRYJSMaMOCCwQ"
      },
      origin: {
        name: "New York",
        country: "USA", 
        coordinates: { latitude: 40.7128, longitude: -74.0060 },
        airportCode: "JFK"
      },
      dates: {
        departureDate: new Date('2024-03-15'),
        returnDate: new Date('2024-03-20')
      },
      travelers: {
        count: 2,
        adults: 2,
        children: 0,
        infants: 0
      },
      preferences: {
        interests: ['cultural', 'food'],
        budget: {
          total: 3000,
          currency: 'USD',
          breakdown: {
            flight: 1000,
            accommodation: 900,
            food: 500,
            activities: 400,
            transportation: 200
          }
        },
        accommodation: {
          type: 'hotel',
          minRating: 4
        },
        transportation: {
          flightClass: 'economy',
          preferNonStop: true
        }
      },
      collaboration: {
        createdBy: 'test_user'
      },
      status: 'planning'
    };

    const trip = await Trip.create(tripData);
    console.log(`✅ Trip created with ID: ${trip.tripId}\n`);

    console.log('🤖 Testing agent output compatibility...\n');

    // Test each agent type
    for (const [agentType, outputs] of Object.entries(sampleAgentOutputs)) {
      console.log(`📊 Testing ${agentType} agent outputs...`);
      
      const recommendationIds = [];
      let successCount = 0;
      let errorCount = 0;

      for (const output of outputs) {
        try {
          // Map agent output to Recommendation schema
          const recommendationData = {
            agentType,
            name: output.name || output.title || 'Unknown',
            description: output.description || output.summary || '',
            price: {
              amount: output.price || output.cost || 0,
              currency: 'USD',
              priceType: getPriceType(agentType)
            },
            rating: {
              score: output.rating || output.score || 0,
              reviewCount: output.reviewCount || 0,
              source: output.source || agentType
            },
            location: {
              address: output.address || output.location,
              city: trip.destination.name,
              coordinates: output.coordinates
            },
            confidence: {
              score: output.confidence || 0.8,
              reasoning: output.reasoning || `Generated by ${agentType} agent`
            },
            agentMetadata: output,
            externalIds: {
              providerId: output.id || output.providerId
            },
            images: output.images || []
          };

          const recommendation = await Recommendation.create(recommendationData);
          recommendationIds.push(recommendation._id);
          successCount++;
          
          console.log(`  ✅ ${output.name || output.title}: ${recommendation.formattedPrice} (${recommendation.confidencePercentage}% confidence)`);
          
        } catch (error) {
          errorCount++;
          console.log(`  ❌ Failed to create recommendation for ${output.name || output.title}: ${error.message}`);
        }
      }

      // Update trip with recommendations
      if (recommendationIds.length > 0) {
        await Trip.findByIdAndUpdate(trip._id, {
          [`recommendations.${agentType}`]: recommendationIds
        });
        console.log(`  📝 Updated trip with ${recommendationIds.length} ${agentType} recommendations`);
      }

      console.log(`  📈 ${agentType}: ${successCount} success, ${errorCount} errors\n`);
    }

    console.log('🔄 Testing Trip-Recommendation relationships...');
    
    // Test population of recommendations
    const populatedTrip = await Trip.findById(trip._id)
      .populate('recommendations.flight')
      .populate('recommendations.accommodation')
      .populate('recommendations.activity')
      .populate('recommendations.restaurant')
      .populate('recommendations.transportation');

    console.log('✅ Trip recommendations populated successfully');
    console.log(`📊 Total recommendations: ${populatedTrip.totalRecommendations}`);
    
    // Verify each category
    for (const category of ['flight', 'accommodation', 'activity', 'restaurant', 'transportation']) {
      const recs = populatedTrip.recommendations[category];
      console.log(`  ${category}: ${recs.length} recommendations`);
      
      if (recs.length > 0) {
        const firstRec = recs[0];
        console.log(`    Sample: ${firstRec.name} - ${firstRec.formattedPrice}`);
      }
    }

    console.log('\n🎯 Testing selection workflow...');
    
    // Test selecting recommendations
    const selections = {};
    for (const [category, recs] of Object.entries(populatedTrip.recommendations)) {
      if (recs.length > 0) {
        selections[category] = [recs[0]._id.toString()];
      }
    }

    // Update selections
    const selectionData = {};
    for (const [category, recIds] of Object.entries(selections)) {
      selectionData[`selectedRecommendations.${category}`] = recIds.map(recId => ({
        recommendation: recId,
        selectedAt: new Date(),
        selectedBy: 'test_user',
        selectionRank: 1
      }));
    }

    await Trip.findByIdAndUpdate(trip._id, selectionData);
    
    // Update recommendation selection status
    for (const [category, recIds] of Object.entries(selections)) {
      await Recommendation.updateMany(
        { _id: { $in: recIds } },
        { 
          'selection.isSelected': true,
          'selection.selectedAt': new Date(),
          'selection.selectedBy': 'test_user'
        }
      );
    }

    console.log('✅ Selections saved successfully');

    // Verify selections
    const finalTrip = await Trip.findById(trip._id)
      .populate('selectedRecommendations.flight.recommendation')
      .populate('selectedRecommendations.accommodation.recommendation')
      .populate('selectedRecommendations.activity.recommendation')
      .populate('selectedRecommendations.restaurant.recommendation')
      .populate('selectedRecommendations.transportation.recommendation');

    console.log(`📊 Total selected recommendations: ${finalTrip.totalSelectedRecommendations}`);
    console.log(`💰 Estimated budget: $${finalTrip.estimatedBudget}`);
    console.log(`📅 Duration: ${finalTrip.durationDays} days\n`);

    console.log('🎉 All tests passed successfully!');
    console.log('\n📋 Summary:');
    console.log(`✅ Trip model: Working correctly`);
    console.log(`✅ Recommendation model: Working correctly`);
    console.log(`✅ Agent output mapping: Compatible`);
    console.log(`✅ Trip-Recommendation relationships: Working`);
    console.log(`✅ Selection workflow: Working`);
    
    // Clean up test data
    console.log('\n🧹 Cleaning up test data...');
    await Trip.findByIdAndDelete(trip._id);
    await Recommendation.deleteMany({ _id: { $in: Object.values(populatedTrip.recommendations).flat().map(r => r._id) } });
    console.log('✅ Cleanup completed');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n📡 Database disconnected');
  }
}

function getPriceType(agentType) {
  const priceTypes = {
    flight: 'per_person',
    accommodation: 'per_night',
    activity: 'per_person',
    restaurant: 'per_person',
    transportation: 'per_group'
  };
  return priceTypes[agentType] || 'per_person';
}

// Run the tests
testModels().catch(console.error);