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
    // 1. 抓取更多的候選文章 (Top 10)，以應對可能的重複
    const candidates = await getTopStories(10);
    
    // 2. 查詢「昨天以前」已經存過的 URL，避免內容重複
    // 注意：不應包含今天，否則當天多次執行會導致今日內容被過濾掉
    const todayDate = new Date().toISOString().split('T')[0];
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const dateLimit = threeDaysAgo.toISOString().split('T')[0];

    const { data: recentStories } = await supabaseAdmin
      .from('hn_daily')
      .select('url')
      .lt('date', todayDate) // 小於今天
      .gte('date', dateLimit); // 大於等於 3 天前

    const recentUrls = new Set(recentStories?.map(s => s.url) || []);

    // 3. 篩選出「新面孔」，並只取前 5 篇
    const freshStories = candidates
      .filter(story => !recentUrls.has(story.url))
      .slice(0, 5);

    console.log(`Filtering complete: Found ${freshStories.length} new stories out of ${candidates.length} candidates.`);

    const results = [];
    const today = new Date().toISOString().split('T')[0];

    // 4. 針對這 5 篇進行處理 (重新分配 1-5 的 Rank)
    for (let i = 0; i < freshStories.length; i++) {
      const story = freshStories[i];
      const targetRank = i + 1; // 重新定義當天的 1-5 名

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
            rank: targetRank, // 使用當天的新排名
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

        if (error) {
          console.error(`Error saving story ${targetRank}:`, error);
          results.push({ rank: targetRank, status: 'error', error: error.message });
        } else {
          results.push({ rank: targetRank, status: 'success', title: story.title });
        }

      } catch (innerError) {
        console.error(`Error processing story ${targetRank}:`, innerError);
        results.push({ rank: targetRank, status: 'error', error: String(innerError) });
      }
    }

    return NextResponse.json({
      message: 'HN Daily processing complete (Novelty-First)',
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
