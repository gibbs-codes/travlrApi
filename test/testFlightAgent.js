// test/testFlightAgent.js (create this file)
import { FlightAgent } from '../src/agents/flightAgent.js';
import dotenv from 'dotenv';

dotenv.config();

async function testFlightAgent() {
  console.log('🧪 Testing FlightAgent with real Amadeus API...');
  
  const agent = new FlightAgent({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY
  });

  const testCriteria = {
    origin: 'JFK',        // New York
    destination: 'CDG',   // Paris
    departureDate: '2024-03-15',
    returnDate: '2024-03-22',
    travelers: 1,
    maxPrice: 1000,
    preferNonStop: false
  };

  try {
    console.log('Searching flights with criteria:', testCriteria);
    
    const result = await agent.execute({ criteria: testCriteria });
    
    if (result.success) {
      console.log('✅ Success!');
      console.log(`Found ${result.data.content.recommendations.length} flight recommendations`);
      console.log('Top recommendation:', result.data.content.recommendations[0]);
      console.log('AI reasoning:', result.data.content.reasoning);
    } else {
      console.log('❌ Failed:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testFlightAgent();