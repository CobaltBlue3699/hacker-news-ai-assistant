import * as cheerio from 'cheerio';

export interface HNStory {
  rank: number;
  title: string;
  url: string;
  points: number;
  id: string;
}

export interface OpenGraphData {
  image?: string;
  title?: string;
  description?: string;
}

export interface ArticleResult {
  content: string;
  og: OpenGraphData;
}

export async function getTopStories(limit = 5): Promise<HNStory[]> {
  const startTime = Date.now();
  console.log(`[HN Scraper] Starting to fetch top stories from HN (limit: ${limit})...`);
  try {
    const response = await fetch('https://news.ycombinator.com/', {
      next: { revalidate: 60 }, // Cache for 60 seconds
    });
    
    if (!response.ok) {
      console.error(`[HN Scraper] Failed to fetch HN: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch HN: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const stories: HNStory[] = [];

    const items = $('.athing');
    console.log(`[HN Scraper] Found ${items.length} potential stories on the page.`);

    items.each((i, el) => {
      if (stories.length >= limit) return false;

      const id = $(el).attr('id') || '';
      const rankStr = $(el).find('.rank').text().replace('.', '');
      const rank = parseInt(rankStr, 10);
      
      const titleLine = $(el).find('.titleline > a').first();
      const title = titleLine.text();
      const url = titleLine.attr('href') || '';

      // The subtext row is the next sibling
      const subtextRow = $(el).next();
      const scoreStr = subtextRow.find('.score').text();
      const points = parseInt(scoreStr.replace(/ points?/, '') || '0', 10);

      if (title && url) {
        stories.push({
          rank,
          title,
          url,
          points,
          id,
        });
        console.log(`[HN Scraper] Story added: [#${rank}] ${title} (ID: ${id})`);
      } else {
        console.warn(`[HN Scraper] Skipping invalid story at rank ${rank}: Missing title or URL.`);
      }
    });

    const duration = Date.now() - startTime;
    console.log(`[HN Scraper] Successfully fetched ${stories.length} stories in ${duration}ms.`);
    return stories;
  } catch (error) {
    console.error('[HN Scraper] Error fetching HN stories:', error);
    return [];
  }
}

export async function fetchArticleContent(url: string): Promise<ArticleResult> {
  const startTime = Date.now();
  const emptyResult: ArticleResult = { content: '', og: {} };

  if (!url) {
    console.warn('[HN Scraper] fetchArticleContent called with empty URL.');
    return emptyResult;
  }

  // 1. 處理 HN 內部連結 (Ask HN, Show HN, etc.)
  const isInternalHN = url.startsWith('item?id=') || url.includes('news.ycombinator.com/item?id=');
  const targetUrl = isInternalHN && url.startsWith('item?id=') 
    ? `https://news.ycombinator.com/${url}` 
    : url;

  console.log(`[HN Scraper] Fetching content for: ${targetUrl} (Internal: ${isInternalHN})`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(targetUrl, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7',
      }
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[HN Scraper] Failed to fetch content for ${targetUrl}: ${response.status} ${response.statusText}`);
      return emptyResult;
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    
    // 2. 提取 Open Graph Data
    const og: OpenGraphData = {
      image: $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content'),
      title: $('meta[property="og:title"]').attr('content') || $('title').text(),
      description: $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content'),
    };

    console.log(`[HN Scraper] OG Data found: ${og.title ? 'Title OK' : 'No Title'}, ${og.image ? 'Image OK' : 'No Image'}`);

    // 針對 HN 內部連結的特殊 OG 處理
    if (isInternalHN) {
      og.title = og.title || 'Hacker News Discussion';
      og.description = og.description || 'Community discussion on Hacker News.';
    }

    let text = '';

    if (isInternalHN) {
      // 3. HN 內部連結處理：抓取熱門評論 (前 5 則)
      const comments: string[] = [];
      $('.comtr').each((i, el) => {
        if (comments.length >= 5) return false;
        const commentText = $(el).find('.commtext').text().trim();
        if (commentText) {
          comments.push(`Comment ${i + 1}: ${commentText}`);
        }
      });
      
      const threadTitle = $('.titleline').text() || $('title').text();
      text = `Discussion Thread: ${threadTitle}\n\nTop Comments:\n${comments.join('\n\n')}`;
      console.log(`[HN Scraper] Internal HN thread processed: ${comments.length} comments extracted.`);
    } else {
      // 4. 網頁內容雜訊排除 (Noise Reduction)
      // 移除常見的非核心內容標籤
      const removedCount = $('script, style, nav, footer, header, aside, noscript, iframe, .ads, .sidebar, .menu, .footer, .nav').length;
      $('script, style, nav, footer, header, aside, noscript, iframe, .ads, .sidebar, .menu, .footer, .nav').remove();
      
      // 優先嘗試抓取 main 或 article 標籤
      const mainContent = $('main, article, #content, .content, .post-content').first();
      if (mainContent.length > 0) {
        text = mainContent.text();
        console.log('[HN Scraper] Content extracted from semantic tags (main/article).');
      } else {
        text = $('body').text();
        console.log('[HN Scraper] Content extracted from body tag.');
      }
      
      text = text.replace(/\s+/g, ' ').trim();
    }
    
    const duration = Date.now() - startTime;
    console.log(`[HN Scraper] Successfully fetched content for ${targetUrl} (Length: ${text.length}) in ${duration}ms.`);
    
    return {
      content: text.slice(0, 10000), 
      og,
    };
  } catch (error) {
    console.warn(`[HN Scraper] Failed to fetch content for ${url} (Error: ${String(error)})`);
    return emptyResult;
  }
}
