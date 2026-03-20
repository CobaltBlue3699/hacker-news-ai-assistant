import { NextResponse } from 'next/server';
import { getTopStories, fetchArticleContent } from '@/lib/hn-scraper';
import { generateSummary, generateEmbedding } from '@/lib/ai-processor';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 60; // Allow up to 60 seconds for execution

export async function GET(request: Request) {
  // Authorization check for Vercel Cron
  const isDev = process.env.NODE_ENV === 'development';
  const authHeader = request.headers.get('authorization');
  
  if (
    !isDev &&
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stories = await getTopStories(5);
    const results = [];

    for (const story of stories) {
      try {
        // 1. Fetch content (or skip if internal/failed)
        const content = await fetchArticleContent(story.url);
        
        // 2. Generate Summary
        const summary = await generateSummary(story.title, content);
        
        // 3. Generate Embedding (Title + Summary for semantic search)
        // We embed the combination to capture the essence of the story
        const textToEmbed = `Title: ${story.title}\nSummary: ${summary}`;
        const embedding = await generateEmbedding(textToEmbed);
        
        // 4. Upsert to Supabase
        const { error } = await supabaseAdmin
          .from('hn_daily')
          .upsert({
            date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
            rank: story.rank,
            title: story.title,
            points: story.points,
            url: story.url,
            summary: summary,
            embedding: embedding,
          }, {
            onConflict: 'date, rank'
          });

        if (error) {
          console.error(`Error saving story ${story.rank}:`, error);
          results.push({ rank: story.rank, status: 'error', error: error.message });
        } else {
          results.push({ rank: story.rank, status: 'success', title: story.title });
        }

      } catch (innerError) {
        console.error(`Error processing story ${story.rank}:`, innerError);
        results.push({ rank: story.rank, status: 'error', error: String(innerError) });
      }
    }

    return NextResponse.json({
      message: 'HN Daily processing complete',
      results
    });

  } catch (error) {
    console.error('HN Daily processing failed:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: String(error) },
      { status: 500 }
    );
  }
}
