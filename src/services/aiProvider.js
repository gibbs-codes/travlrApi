import OpenAI from 'openai';
import { Ollama } from 'ollama';

export class AIProviderFactory {
  static createProvider(type = 'openai', config = {}) {
    switch (type.toLowerCase()) {
      case 'openai':
        return new OpenAIProvider(config);
      case 'ollama':
        return new OllamaProvider(config);
      case 'mock':
        return new MockAIProvider(config);
      default:
        throw new Error(`Unsupported AI provider: ${type}`);
    }
  }
}

class BaseAIProvider {
  constructor(config) {
    this.config = config;
  }

  async generateCompletion(_prompt, _options = {}) {
    throw new Error('generateCompletion must be implemented by subclass');
  }

  async generateStructuredCompletion(_prompt, _schema, _options = {}) {
    throw new Error('generateStructuredCompletion must be implemented by subclass');
  }
}

class OpenAIProvider extends BaseAIProvider {
  constructor(config) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
    });
    // **FIX: Use gpt-4 (128K context) or gpt-3.5-turbo-16k**
    this.model = config.model || 'gpt-4-turbo-preview';  // or 'gpt-3.5-turbo-16k'
  }

  async generateCompletion(prompt, options = {}) {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 500,  // **FIX: Reduced from 1000**
        ...options,
      });
      
      return {
        content: response.choices[0].message.content,
        usage: response.usage,
        model: response.model,
      };
    } catch (error) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }
}

class OllamaProvider extends BaseAIProvider {
  constructor(config) {
    super(config);
    this.client = new Ollama({
      host: config.host || process.env.OLLAMA_HOST || 'http://localhost:11434',
    });
    this.model = config.model || 'llama2';
  }

  async generateCompletion(prompt, options = {}) {
    try {
      const response = await this.client.generate({
        model: this.model,
        prompt,
        options: {
          temperature: options.temperature || 0.7,
          num_predict: options.maxTokens || 1000,
        },
        ...options,
      });
      
      return {
        content: response.response,
        model: this.model,
        done: response.done,
      };
    } catch (error) {
      throw new Error(`Ollama API error: ${error.message}`);
    }
  }

  async generateStructuredCompletion(prompt, schema, options = {}) {
    const structuredPrompt = `${prompt}

Please respond in the following JSON format:
${JSON.stringify(schema, null, 2)}

Only return valid JSON, no additional text.`;
    
    const response = await this.generateCompletion(structuredPrompt, options);

    try {
      return {
        ...response,
        content: JSON.parse(response.content),
      };
    } catch (error) {
      throw new Error(`Failed to parse structured response: ${error.message}`);
    }
  }
}

class MockAIProvider extends BaseAIProvider {
  constructor(config) {
    super(config);
    this.model = config.model || 'mock-gpt-3.5-turbo';
  }

  async generateCompletion(prompt, options = {}) {
    // Simulate API delay
    const delay = parseInt(process.env.MOCK_DELAY_MS) || 500;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Generate mock response based on prompt content
    const mockResponse = this.generateMockResponse(prompt);
    
    return {
      content: mockResponse,
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
      model: this.model,
    };
  }

  async generateStructuredCompletion(prompt, schema, options = {}) {
    // Simulate API delay
    const delay = parseInt(process.env.MOCK_DELAY_MS) || 500;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Generate mock structured response based on schema
    const mockContent = this.generateMockStructuredContent(prompt, schema);
    
    return {
      content: mockContent,
      usage: { prompt_tokens: 150, completion_tokens: 250, total_tokens: 400 },
      model: this.model,
    };
  }

  generateMockResponse(prompt) {
    if (prompt.includes('trip') || prompt.includes('travel')) {
      return `Based on your travel request, I recommend exploring the destination thoroughly. Consider visiting popular attractions, trying local cuisine, and experiencing the culture. The itinerary should balance sightseeing with relaxation time.`;
    }
    
    if (prompt.includes('flight')) {
      return `For flight recommendations, I suggest booking in advance for better prices. Consider factors like departure times, layovers, and airline reputation when making your selection.`;
    }

    return `Thank you for your request. I've analyzed the information and provide recommendations based on the criteria specified.`;
  }

  generateMockStructuredContent(prompt, schema) {
    // Generate mock data based on schema structure
    if (schema.recommendations) {
      // This is for individual agents
      return {
        recommendations: [
          { id: 'mock-1', name: 'Mock Recommendation 1', price: 100, rating: 4.5 },
          { id: 'mock-2', name: 'Mock Recommendation 2', price: 150, rating: 4.2 },
          { id: 'mock-3', name: 'Mock Recommendation 3', price: 120, rating: 4.7 }
        ],
        confidence: 85,
        reasoning: 'Generated mock recommendations based on criteria',
        metadata: {
          source: 'mock-provider',
          timestamp: new Date().toISOString()
        }
      };
    }

    if (schema.tripSummary) {
      // This is for the trip orchestrator
      return {
        tripSummary: {
          destination: 'Paris, France',
          dates: { departure: '2024-03-15', return: '2024-03-20' },
          budget: { total: 2500, breakdown: { flight: 800, accommodation: 900, activities: 400, dining: 400 } },
          confidence: 88
        },
        recommendations: {
          flights: [
            { id: 'FL001', airline: 'Air France', price: 650, departure: '08:00', arrival: '20:15' },
            { id: 'FL002', airline: 'Delta', price: 720, departure: '10:30', arrival: '22:45' }
          ],
          accommodation: [
            { id: 'HTL001', name: 'Le Grand Hotel', price: 280, rating: 4.5, type: 'hotel' },
            { id: 'HTL002', name: 'Paris Boutique Inn', price: 180, rating: 4.2, type: 'hotel' }
          ],
          activities: [
            { id: 'ACT001', name: 'Eiffel Tower Tour', price: 45, duration: '3 hours', rating: 4.6 },
            { id: 'ACT002', name: 'Louvre Museum', price: 25, duration: '4 hours', rating: 4.8 }
          ],
          restaurants: [
            { id: 'REST001', name: 'Le Petit Bistro', cuisine: 'French', price: 65, rating: 4.7 },
            { id: 'REST002', name: 'Café de Flore', cuisine: 'Cafe', price: 35, rating: 4.4 }
          ],
          transportation: [
            { id: 'TRANS001', type: 'metro', provider: 'RATP', estimatedCost: 15, coverage: 'city-wide' },
            { id: 'TRANS002', type: 'taxi', provider: 'G7', estimatedCost: 25, availability: 'on-demand' }
          ]
        },
        itinerary: [
          {
            date: '2024-03-15',
            day: 1,
            activities: [{ name: 'Arrival and hotel check-in' }, { name: 'Evening stroll along Seine' }],
            restaurants: [{ name: 'Le Petit Bistro', meal: 'dinner' }]
          },
          {
            date: '2024-03-16', 
            day: 2,
            activities: [{ name: 'Eiffel Tower Tour' }, { name: 'Louvre Museum' }],
            restaurants: [{ name: 'Café de Flore', meal: 'lunch' }]
          }
        ],
        alternatives: [],
        metadata: {
          searchCriteria: {},
          executionTime: '1500ms',
          agentResults: {}
        }
      };
    }

    return schema;
  }
}