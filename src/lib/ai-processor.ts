import { embed, generateText } from 'ai';
import { geminiFlashModel, geminiEmbeddingModel } from './gemini';

export async function generateSummary(title: string, content: string): Promise<string> {
  const prompt = `
    Summarize the following article in Traditional Chinese (繁體中文).
    Target length: 20-30 words.
    Tone: Professional and concise.
    
    Title: ${title}
    Content (partial): ${content ? content.slice(0, 3000) : 'No content available, summarize based on title.'}
  `;

  try {
    const { text } = await generateText({
      model: geminiFlashModel,
      prompt: prompt,
    });
    return text.trim();
  } catch (error) {
    console.error('Error generating summary:', error);
    return '無法生成摘要。';
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const { embedding } = await embed({
      model: geminiEmbeddingModel,
      value: text,
      providerOptions: {
        google: {
          outputDimensionality: 768,
        },
      },
    });
    
    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}
