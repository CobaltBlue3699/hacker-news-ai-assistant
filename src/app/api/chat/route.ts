import { convertToModelMessages, stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import { generateEmbedding } from '@/lib/ai-processor';
import { searchSimilarStories } from '@/lib/rag';
import { fetchArticleContent } from '@/lib/hn-scraper';
import { geminiFlashModel } from '@/lib/gemini';

export const maxDuration = 120;

export async function POST(req: Request) {
  const { messages: uiMessages } = await req.json();

  // Convert UIMessages to CoreMessages for streamText
  const modelMessages = await convertToModelMessages(uiMessages);

  // 1. Get current date for LLM context
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // 2. System Prompt
  const systemPrompt = `
    You are a professional Hacker News (HN) AI assistant.
    Current date: ${todayStr}.
    
    Your capabilities:
    1. Search the "HN Daily" database using the 'search_stories' tool. You can extract keywords and date ranges (YYYY-MM-DD) from the user's query.
    2. Fetch full article content using the 'browse_page' tool if the summary is insufficient.
    
    Response Guidelines:
    - ALWAYS respond in Traditional Chinese (繁體中文).
    - When mentioning stories, ALWAYS include the source link using Markdown format: [Title](URL).
    - If the user asks general questions like "What's interesting today?", first use 'search_stories'. 
    - For the top 1 or 2 most relevant or interesting stories, proactively use 'browse_page' to get more details if the database summary is too brief.
    - Structure your response with clear headings or bullet points for readability.
    - If no relevant information is found in the database, inform the user politely.
    - Maintain a professional, insightful, and concise tone.
  `;

  // 3. Stream Response with Tools
  const result = streamText({
    model: geminiFlashModel,
    system: systemPrompt,
    messages: modelMessages,
    maxRetries: 0,
    tools: {
      search_stories: tool({
        description: `Search the Hacker News daily database by semantic similarity.
- When user asks about "today", set startDate and endDate to today's date.
- When user asks about a specific date or range, provide the dates.
- When user asks general questions without time constraint, omit dates to search all.`,
        inputSchema: z.object({
          query: z.string().describe('The keyword or topic to search for.'),
          startDate: z.string().optional().describe('Start date in YYYY-MM-DD format.'),
          endDate: z.string().optional().describe('End date in YYYY-MM-DD format.'),
        }),
        execute: async ({ query, startDate, endDate }) => {
          try {
            console.log(`[Tool: search_stories] Query: "${query}", Range: ${startDate} to ${endDate}`);
            const embedding = await generateEmbedding(query);
            const stories = await searchSimilarStories(embedding, startDate, endDate);
            
            if (stories.length === 0) {
              return { message: 'No relevant stories found in the specified range.' };
            }

            return {
              results: stories.map(s => ({
                date: s.date,
                rank: s.rank,
                title: s.title,
                points: s.points,
                summary: s.summary,
                url: s.url
              }))
            };
          } catch (error) {
            console.error('Search stories tool failed:', error);
            return { error: 'An error occurred while searching the database.' };
          }
        },
      }),
      browse_page: tool({
        description: 'Fetch the full content of a web page (article) to get more details.',
        inputSchema: z.object({
          url: z.url().describe('The URL of the article to fetch.'),
        }),
        execute: async ({ url }) => {
          try {
            console.log(`[Tool: browse_page] Fetching URL: "${url}"`);
            // Update: Destructure content from the new return type { content, og }
            const { content } = await fetchArticleContent(url);
            console.log(`[Tool: browse_page] Success! Fetched ${content.length} characters.`);
            
            return {
              summary: content.slice(0, 5000) || 'Content is empty or could not be fetched.',
              fullLength: content.length,
              fetchedAt: new Date().toISOString(),
            };
          } catch (error) {
            console.error(`[Tool: browse_page] Failed to fetch article: ${error}`);
            return { error: 'An error occurred while fetching the page content.' };
          }
        },
      }),
    },
    stopWhen: stepCountIs(5), // Allow up to 5 steps (initial + 4 tool roundtrips)
  });

  return result.toUIMessageStreamResponse();
}
