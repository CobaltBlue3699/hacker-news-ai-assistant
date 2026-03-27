import { NextResponse } from 'next/server';
import { getTopStories, fetchArticleContent } from '@/lib/hn-scraper';
import { generateSummary, generateEmbedding } from '@/lib/ai-processor';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 300; // Allow up to 300 seconds for execution

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
    // 1. 抓取更多的候選文章 (Top 10)
    const candidates = await getTopStories(10);
    
    // 2. 冪等性與重複處理過濾 (Idempotency)
    // 查詢最近 3 天（包含今天）已處理過的 URL，確保不重複執行 AI 調用
    const today = new Date().toISOString().split('T')[0];
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const dateLimit = threeDaysAgo.toISOString().split('T')[0];

    const { data: recentStories } = await supabaseAdmin
      .from('hn_daily')
      .select('url')
      .gte('date', dateLimit); // 改為 >= 3天前，包含今天，實現冪等性

    const processedUrls = new Set(recentStories?.map(s => s.url) || []);

    // 3. 篩選出「尚未處理」的新面孔，並取前 5 篇
    const freshStories = candidates
      .filter(story => !processedUrls.has(story.url))
      .slice(0, 5);

    console.log(`Filtering complete: Found ${freshStories.length} new stories out of ${candidates.length} candidates.`);

    if (freshStories.length === 0) {
      return NextResponse.json({
        message: 'No new stories to process today.',
        date: today
      });
    }

    // 4. 併發處理 (Parallelization)
    // 封裝單篇處理邏輯
    const processStory = async (story: typeof freshStories[0], index: number) => {
      const targetRank = index + 1;
      try {
        // Fetch content & Open Graph data
        const { content, og } = await fetchArticleContent(story.url);
        
        // Generate Summary
        const summary = await generateSummary(story.title, content);
        
        // Generate Embedding
        const textToEmbed = `Title: ${story.title}\nSummary: ${summary}`;
        const embedding = await generateEmbedding(textToEmbed);
        
        // Upsert to Supabase
        const { error } = await supabaseAdmin
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

        if (error) throw error;
        
        return { rank: targetRank, status: 'success', title: story.title };
      } catch (error) {
        console.error(`Error processing story ${targetRank}:`, error);
        return { rank: targetRank, status: 'error', error: String(error) };
      }
    };

    // 使用 Promise.all 同時處理所有新鮮文章
    const results = await Promise.all(
      freshStories.map((story, i) => processStory(story, i))
    );

    return NextResponse.json({
      message: 'HN Daily processing complete (Parallel & Idempotent)',
      date: today,
      count: freshStories.length,
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
