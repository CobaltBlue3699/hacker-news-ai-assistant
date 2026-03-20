import { convertToModelMessages, stepCountIs, streamText, tool, isTextUIPart, type TextUIPart } from 'ai';
import { z } from 'zod';
import { generateEmbedding } from '@/lib/ai-processor';
import { searchSimilarStories } from '@/lib/rag';
import { fetchArticleContent } from '@/lib/hn-scraper';
import { geminiFlashModel } from '@/lib/gemini';

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages: uiMessages } = await req.json();
  const lastMessage = uiMessages[uiMessages.length - 1];

  // Extract text from the last message for RAG
  const lastUserText = lastMessage.parts
    ? lastMessage.parts
        .filter(isTextUIPart)
        .map((part: TextUIPart) => part.text)
        .join('\n')
    : lastMessage.content || '';

  // Convert UIMessages to CoreMessages for streamText
  const modelMessages = await convertToModelMessages(uiMessages);

  // 1. RAG: Retrieve context from Supabase
  let context = '';
  try {
    if (lastUserText) {
      const embedding = await generateEmbedding(lastUserText);
      const similarStories = await searchSimilarStories(embedding);
      
      if (similarStories.length > 0) {
        context = similarStories.map(story => 
          `- [${story.date}] #${story.rank} ${story.title} (${story.points} points): ${story.summary} (URL: ${story.url})`
        ).join('\n');
      }
    }
  } catch (error) {
    console.error('Context retrieval failed:', error);
    // Continue without context if RAG fails
  }

  // 2. System Prompt
  const systemPrompt = `
    You are a helpful and professional AI assistant for Hacker News (HN).
    You speak Traditional Chinese (繁體中文).
    
    Here is the relevant context from the daily top stories database:
    ${context ? context : 'No relevant daily stories found in database.'}
    
    Instructions:
    - Prioritize using the provided context to answer questions about "today's news" or "recent popular stories".
    - If the user asks for details about a specific story that are not in the summary, use the 'browse_page' tool to fetch the full content.
    - If the user asks general questions, answer normally.
    - Always answer in Traditional Chinese.
  `;

  // 3. Stream Response
  const result = streamText({
    model: geminiFlashModel,
    system: systemPrompt,
    messages: modelMessages,
    maxRetries: 0, // Disable automatic retries to preserve quota and handle 429 faster
    tools: {
      browse_page: tool({
        description: 'Fetch the full content of a web page (article) to get more details.',
        inputSchema: z.object({
          url: z.url().describe('The URL of the article to fetch.'),
        }),
        execute: async ({ url }) => {
          try {
            const content = await fetchArticleContent(url);
            return {
              summary: content.slice(0, 5000) || '無法獲取內容或內容為空。',
              fullLength: content.length,
              fetchedAt: new Date().toISOString(),
            };
          } catch (error) {
            console.error('Fetch article failed:', error);
            return { error: '擷取頁面內容時發生錯誤。' };
          }
        },
      }),
    },
    stopWhen: stepCountIs(5), // Allow up to 5 steps (initial + 4 tool roundtrips)
  });

  return result.toUIMessageStreamResponse();
}
