import { TripOrchestrator } from '../src/agents/tripOrchestrator.js';
import dotenv from 'dotenv';

dotenv.config();

async function testTripOrchestratorWithActivity() {
  console.log('🧪 Testing TripOrchestrator with ActivityAgent integration...');
  
  const orchestrator = new TripOrchestrator({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY
  });

  const tripRequest = {
    destination: 'Paris, France',
    origin: 'JFK',
    departureDate: '2024-04-15',
    returnDate: '2024-04-22',
    interests: ['art', 'food', 'culture'],
    travelers: 2,
    budget: {
      total: 2000,
      activities: 200
    },
    preferences: {
      accommodationType: 'hotel',
      activityLevel: 'easy'
    }
  };

  try {
    // Test just the activity agent through the orchestrator
    console.log('Testing activity agent specifically...');
    const activityResult = await orchestrator.agents.activity.execute({
      criteria: {
        destination: tripRequest.destination,
        interests: tripRequest.interests,
        travelersCount: tripRequest.travelers,
        budget: tripRequest.budget.activities
      }
    });

    if (activityResult.success) {
      console.log('✅ ActivityAgent integration successful!');
      console.log('Activity result structure:');
      console.log('- Has content.recommendations:', !!activityResult.data.content?.recommendations);
      console.log('- Has confidence:', !!activityResult.data.confidence || !!activityResult.data.content?.confidence);
      console.log('- Has reasoning:', !!activityResult.data.reasoning || !!activityResult.data.content?.reasoning);
      console.log('- Has metadata:', !!activityResult.data.metadata);
      
      const activities = activityResult.data.content?.recommendations || activityResult.data.recommendations;
      if (activities && activities.length > 0) {
        console.log('- Sample activity has price property:', !!activities[0].price);
        console.log('- Sample activity category:', activities[0].category);
      }
    } else {
      console.log('❌ ActivityAgent failed:', activityResult.error);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testTripOrchestratorWithActivity();