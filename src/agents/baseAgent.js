import { AIProviderFactory } from '../services/aiProvider.js';

export class BaseAgent {
  constructor(name, capabilities = [], aiConfig = {}) {
    this.name = name;
    this.capabilities = capabilities;
    this.isActive = false;
    this.aiProvider = AIProviderFactory.createProvider(
      aiConfig.provider || process.env.AI_PROVIDER || 'openai',
      aiConfig
    );
  }

  async execute(_task) {
    throw new Error('Execute method must be implemented by subclass');
  }

  async generateResponse(prompt, options = {}) {
    return await this.aiProvider.generateCompletion(prompt, options);
  }

  async generateStructuredResponse(prompt, schema, options = {}) {
    return await this.aiProvider.generateStructuredCompletion(prompt, schema, options);
  }

  activate() {
    this.isActive = true;
    console.log(`${this.name} agent activated`);
  }

  deactivate() {
    this.isActive = false;
    console.log(`${this.name} agent deactivated`);
  }

  getStatus() {
    return {
      name: this.name,
      capabilities: this.capabilities,
      isActive: this.isActive,
      aiProvider: this.aiProvider.constructor.name
    };
  }
}

export class TripPlanningAgent extends BaseAgent {
  constructor(name, capabilities, aiConfig, searchConfig = {}) {
    super(name, capabilities, aiConfig);
    this.searchConfig = searchConfig;
    this.resultSchema = {
      recommendations: [],
      confidence: 0,
      reasoning: '',
      metadata: {}
    };
  }

  async search(_criteria) {
    throw new Error('Search method must be implemented by subclass');
  }

  async rank(_results) {
    throw new Error('Rank method must be implemented by subclass');
  }

  async execute(task) {
    try {
      this.activate();
      const searchResults = await this.search(task.criteria);
      const rankedResults = await this.rank(searchResults);
      const recommendations = await this.generateRecommendations(rankedResults, task);
      
      return {
        agentName: this.name,
        success: true,
        data: recommendations,
        executedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        agentName: this.name,
        success: false,
        error: error.message,
        executedAt: new Date().toISOString()
      };
    } finally {
      this.deactivate();
    }
  }

  async generateRecommendations(results, task) {
    const prompt = `
Based on the following search results and user criteria, provide top recommendations:

User Criteria: ${JSON.stringify(task.criteria)}
Search Results: ${JSON.stringify(results)}

Please analyze and recommend the best options, explaining your reasoning.
    `;

    return await this.generateStructuredResponse(prompt, this.resultSchema);
  }
}