import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchArticleContent } from '@/lib/hn-scraper';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // 1. 先嘗試從資料庫尋找現有的日報元數據
    const { data } = await supabaseAdmin
      .from('hn_daily')
      .select('og_image, og_title, og_description')
      .eq('url', url)
      .limit(1)
      .single();

    if (data) {
      return NextResponse.json({
        image: data.og_image,
        title: data.og_title,
        description: data.og_description,
        source: 'database'
      });
    }

    // 2. 資料庫未命中 (Cache Miss)，執行即時抓取 (Fetch OG Tags)
    // 使用與日報爬蟲相同的 fetchArticleContent 函數以維持一致性
    console.log(`Metadata cache miss for: ${url}, fetching real-time...`);
    const { og } = await fetchArticleContent(url);

    if (og && (og.title || og.image)) {
      return NextResponse.json({
        image: og.image,
        title: og.title,
        description: og.description,
        source: 'scraper'
      });
    }

    return NextResponse.json({ error: 'Metadata not found' }, { status: 404 });

  } catch (error) {
    console.error('Metadata API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
