import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export interface LLMProvider {
  complete(
    systemPrompt: string,
    userPrompt: string,
    onChunk?: (chunk: string) => void
  ): Promise<string>;
}

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey: string, private model: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(
    systemPrompt: string,
    userPrompt: string,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        if (onChunk) {
          onChunk(content);
        }
      }
    }

    return fullResponse;
  }
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey: string, private model: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(
    systemPrompt: string,
    userPrompt: string,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const stream = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      stream: true,
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        const content = chunk.delta.text;
        fullResponse += content;
        if (onChunk) {
          onChunk(content);
        }
      }
    }

    return fullResponse;
  }
}

export function createProvider(
  provider: 'openai' | 'anthropic',
  apiKey: string,
  model: string
): LLMProvider {
  if (provider === 'openai') {
    return new OpenAIProvider(apiKey, model);
  } else {
    return new AnthropicProvider(apiKey, model);
  }
}
