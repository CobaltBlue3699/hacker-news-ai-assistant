import { embed, generateText } from 'ai';
import { geminiFlashModel, geminiEmbeddingModel } from './gemini';

export async function generateSummary(title: string, content: string): Promise<string> {
  // 增加內容擷取上限以獲得更完整的上下文
  // Gemini Flash 支援極大 Context，這裡放寬到 10,000 字元
  const maxContentLength = 10000;
  const processedContent = content ? content.slice(0, maxContentLength) : '';
  
  const prompt = `
    你是一位專業的技術新聞編輯。請針對以下文章提供一段精煉的繁體中文 (Traditional Chinese) 摘要。
    
    要求：
    1. 長度控制在 20-40 字之間。
    2. 語氣專業、客觀且具備資訊價值。
    3. 如果內容不完整，請根據現有資訊與標題推論核心意義。
    4. 直接輸出摘要文字，不要包含「這篇文章是關於...」或「摘要如下」等冗餘文字。
    
    文章標題: ${title}
    文章內容 (片段): ${processedContent || '無內容，請僅根據標題生成簡短預測摘要。'}
  `;

  try {
    const { text } = await generateText({
      model: geminiFlashModel,
      prompt: prompt,
      temperature: 0.3, // 降低隨機性，讓摘要更穩定
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
