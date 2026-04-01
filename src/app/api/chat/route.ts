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

TOOLS:
1. search_stories: Search by keyword + date range (YYYY-MM-DD).
2. browse_page: Fetch article content + HN comments for deep analysis.

WORKFLOW - Trend Analysis (Multi-step Retrieval):
When user asks about trends, changes, or comparisons (e.g., "AI 的變化", "過去三個月"):
- Step 1: search_stories(query, startDate, endDate) for Period A
- Step 2: search_stories(query, startDate, endDate) for Period B
- Step 3: Compare results, summarize evolution

WORKFLOW - Comment Analysis:
When you fetch a page via browse_page, analyze the comments for:
- **Conflict Points**: Top disagreements with the article
- **Expert Insights**: Deep technical counter-arguments
- **Consensus**: General community mood
- **Signal vs Noise**: Focus on comments with substance, ignore one-liners

RESPONSE RULES:
- ALWAYS respond in Traditional Chinese (繁體中文)
- ALWAYS include source links: [Title](URL)
- Structure with headings and bullet points
- Bold key insights
- If no results found, suggest alternative search terms
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
- To compare trends, you can call this tool multiple times with different date ranges.`,
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
        description: `Fetch article content + HN comments for deep analysis.
Returns:
- articleContent: Main article text
- comments: Array of comments with metadata (author, time, reply count)
- Use this to analyze community sentiment, find expert opinions, identify conflicts.`,
        inputSchema: z.object({
          url: z.url().describe('The URL of the article to fetch.'),
          hnItemId: z.string().optional().describe('HN item ID for fetching comments (e.g., "8863"). If not provided, will try to extract from URL.'),
        }),
        execute: async ({ url, hnItemId }) => {
          try {
            console.log(`[Tool: browse_page] Fetching URL: "${url}" (HN ID: ${hnItemId || 'auto'})`);
            const { content, comments } = await fetchArticleContent(url, hnItemId);
            console.log(`[Tool: browse_page] Success! Fetched ${content.length} chars and ${comments.length} comments.`);
            
            return {
              articleContent: content.slice(0, 8000) || 'Content is empty.',
              comments: comments.slice(0, 20),
              commentCount: comments.length,
              fetchedAt: new Date().toISOString(),
            };
          } catch (error) {
            console.error(`[Tool: browse_page] Failed to fetch article: ${error}`);
            return { error: 'An error occurred while fetching the page content.' };
          }
        },
      }),
    },
    stopWhen: stepCountIs(8),
  });

  return result.toUIMessageStreamResponse();
}
