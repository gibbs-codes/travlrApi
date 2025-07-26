import OpenAI from 'openai';
import { Ollama } from 'ollama';

export class AIProviderFactory {
  static createProvider(type = 'openai', config = {}) {
    switch (type.toLowerCase()) {
      case 'openai':
        return new OpenAIProvider(config);
      case 'ollama':
        return new OllamaProvider(config);
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
    this.model = config.model || 'gpt-3.5-turbo';
  }

  async generateCompletion(prompt, options = {}) {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 1000,
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

  async generateStructuredCompletion(prompt, schema, options = {}) {
    const structuredPrompt = `${prompt}\n\nPlease respond in the following JSON format:\n${JSON.stringify(schema, null, 2)}`;
    
    const response = await this.generateCompletion(structuredPrompt, {
      ...options,
      response_format: { type: 'json_object' }
    });

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
    const structuredPrompt = `${prompt}\n\nPlease respond in the following JSON format:\n${JSON.stringify(schema, null, 2)}\n\nOnly return valid JSON, no additional text.`;
    
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