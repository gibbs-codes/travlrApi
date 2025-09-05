import { ActivityAgent } from '../src/agents/activityAgent.js';
import dotenv from 'dotenv';

dotenv.config();

async function testActivityAgent() {
  console.log('🧪 Testing ActivityAgent with OpenAI API...');
  
  const agent = new ActivityAgent({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY
  });

  const testCriteria = {
    destination: 'Paris, France',
    interests: ['art', 'food', 'culture'],
    travelersCount: 2,
    durationPreferences: 'flexible',
    budget: 100,
    travelStyle: 'leisure'
  };

  try {
    console.log('Searching activities with criteria:', testCriteria);
    
    const result = await agent.execute({ criteria: testCriteria });
    
    if (result.success) {
      console.log('✅ Success!');
      console.log('Full result data:', JSON.stringify(result.data, null, 2));
      const activities = result.data.content?.recommendations || result.data.recommendations || result.data.activities;
      console.log(`Found ${activities?.length || 0} activity recommendations`);
      if (activities && activities.length > 0) {
        console.log('Top recommendation:', activities[0]);
      }
      console.log('Confidence:', result.data.confidence || result.data.content?.confidence || 'N/A');
      console.log('Reasoning:', result.data.reasoning || result.data.content?.reasoning || 'N/A');
    } else {
      console.log('❌ Failed:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function testFallback() {
  console.log('\n🧪 Testing ActivityAgent fallback (no API key)...');
  
  const agent = new ActivityAgent({
    provider: 'openai',
    apiKey: 'invalid-key' // This should trigger fallback
  });

  const testCriteria = {
    destination: 'Tokyo, Japan',
    interests: ['culture', 'food'],
    travelersCount: 1
  };

  try {
    const result = await agent.execute({ criteria: testCriteria });
    
    if (result.success) {
      console.log('✅ Fallback worked!');
      console.log('Fallback result data:', JSON.stringify(result.data, null, 2));
      const activities = result.data.content?.recommendations || result.data.recommendations || result.data.activities;
      console.log(`Found ${activities?.length || 0} fallback activities`);
      console.log('Reasoning:', result.data.reasoning || result.data.content?.reasoning);
    } else {
      console.log('❌ Fallback failed:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Fallback test failed:', error.message);
  }
}

// Run tests
testActivityAgent().then(() => testFallback());