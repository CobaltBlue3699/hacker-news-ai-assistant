import { NextResponse } from 'next/server';
import { getTopStories, fetchArticleContent } from '@/lib/hn-scraper';
import { generateSummary, generateEmbedding } from '@/lib/ai-processor';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 300; // Allow up to 300 seconds for execution

export async function GET(request: Request) {
  const routeStartTime = Date.now();
  const today = new Date().toISOString().split('T')[0];
  console.log(`[HN Daily] >>> Starting HN Daily processing for ${today}...`);

  // Authorization check for Vercel Cron
  const isDev = process.env.NODE_ENV === 'development';
  const authHeader = request.headers.get('authorization');
  
  if (
    !isDev &&
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    console.warn('[HN Daily] Unauthorized attempt to trigger CRON route.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. 抓取更多的候選文章 (Top 10)
    console.log('[HN Daily] Step 1: Fetching top 10 candidate stories from HN...');
    const candidates = await getTopStories(10);
    console.log(`[HN Daily] Step 1 complete: Received ${candidates.length} candidates.`);
    
    // 2. 冪等性與重複處理過濾 (Idempotency)
    console.log('[HN Daily] Step 2: Checking for existing stories in the database...');
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const dateLimit = threeDaysAgo.toISOString().split('T')[0];

    const { data: recentStories, error: fetchError } = await supabaseAdmin
      .from('hn_daily')
      .select('url')
      .gte('date', dateLimit);

    if (fetchError) {
      console.error('[HN Daily] Database error while checking for recent stories:', fetchError);
      throw fetchError;
    }

    const processedUrls = new Set(recentStories?.map(s => s.url) || []);
    console.log(`[HN Daily] Found ${processedUrls.size} recently processed stories in the DB.`);

    // 3. 篩選出「尚未處理」的新面孔，並取前 5 篇
    const freshStories = candidates
      .filter(story => {
        const isProcessed = processedUrls.has(story.url);
        if (isProcessed) {
          console.log(`[HN Daily] Skipping already processed story: ${story.title} (${story.url})`);
        }
        return !isProcessed;
      })
      .slice(0, 5);

    console.log(`[HN Daily] Step 3: Filtering complete. Found ${freshStories.length} new stories to process.`);

    if (freshStories.length === 0) {
      console.log(`[HN Daily] No new stories to process for ${today}. Terminating early.`);
      return NextResponse.json({
        message: 'No new stories to process today.',
        date: today
      });
    }

    // 4. 併發處理 (Parallelization)
    console.log(`[HN Daily] Step 4: Starting parallel processing for ${freshStories.length} stories...`);
    
    // 封裝單篇處理邏輯
    const processStory = async (story: typeof freshStories[0], index: number) => {
      const storyStartTime = Date.now();
      const targetRank = index + 1;
      console.log(`[HN Daily] [Story #${targetRank}] Processing: ${story.title}`);
      
      try {
        // Fetch content & Open Graph data
        console.log(`[HN Daily] [Story #${targetRank}] Fetching content...`);
        const { content, og } = await fetchArticleContent(story.url);
        
        if (!content) {
          console.warn(`[HN Daily] [Story #${targetRank}] Warning: No content extracted for this story.`);
        }

        // Generate Summary
        console.log(`[HN Daily] [Story #${targetRank}] Generating AI summary...`);
        const summary = await generateSummary(story.title, content);
        
        // Generate Embedding
        console.log(`[HN Daily] [Story #${targetRank}] Generating embedding...`);
        const textToEmbed = `Title: ${story.title}\nSummary: ${summary}`;
        const embedding = await generateEmbedding(textToEmbed);
        
        // Upsert to Supabase
        console.log(`[HN Daily] [Story #${targetRank}] Saving to database...`);
        const { error: upsertError } = await supabaseAdmin
          .from('hn_daily')
          .upsert({
            date: today,
            rank: targetRank,
            title: story.title,
            points: story.points,
            url: story.url,
            summary: summary,
            embedding: embedding,
            og_image: og?.image || null,
            og_title: og?.title || null,
            og_description: og?.description || null,
          }, {
            onConflict: 'date, rank'
          });

        if (upsertError) {
          console.error(`[HN Daily] [Story #${targetRank}] Database upsert failed:`, upsertError);
          throw upsertError;
        }
        
        const storyDuration = Date.now() - storyStartTime;
        console.log(`[HN Daily] [Story #${targetRank}] Completed successfully in ${storyDuration}ms.`);
        return { rank: targetRank, status: 'success', title: story.title, duration: `${storyDuration}ms` };
      } catch (error) {
        const storyDuration = Date.now() - storyStartTime;
        console.error(`[HN Daily] [Story #${targetRank}] FAILED after ${storyDuration}ms:`, error);
        return { rank: targetRank, status: 'error', error: String(error), duration: `${storyDuration}ms` };
      }
    };

    // 使用 Promise.all 同時處理所有新鮮文章
    const results = await Promise.all(
      freshStories.map((story, i) => processStory(story, i))
    );

    const totalDuration = Date.now() - routeStartTime;
    console.log(`[HN Daily] <<< All stories processed. Total execution time: ${totalDuration}ms.`);

    return NextResponse.json({
      message: 'HN Daily processing complete (Parallel & Idempotent)',
      date: today,
      count: freshStories.length,
      totalDuration: `${totalDuration}ms`,
      results
    });

  } catch (error) {
    console.error('[HN Daily] FATAL ERROR during processing:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: String(error) },
      { status: 500 }
    );
  }
}
