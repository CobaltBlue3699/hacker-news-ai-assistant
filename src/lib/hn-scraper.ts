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
  try {
    const response = await fetch('https://news.ycombinator.com/', {
      next: { revalidate: 60 }, // Cache for 60 seconds
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch HN: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const stories: HNStory[] = [];

    $('.athing').each((i, el) => {
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
      }
    });

    return stories;
  } catch (error) {
    console.error('Error fetching HN stories:', error);
    return [];
  }
}

export async function fetchArticleContent(url: string): Promise<ArticleResult> {
  const emptyResult: ArticleResult = { content: '', og: {} };

  if (!url || url.startsWith('item?id=')) return emptyResult; // Skip internal HN links for now

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 增加到 15s 超時

    const response = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7',
      }
    });
    clearTimeout(timeoutId);

    if (!response.ok) return emptyResult;

    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Extract Open Graph Data
    const og: OpenGraphData = {
      image: $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content'),
      title: $('meta[property="og:title"]').attr('content') || $('title').text(),
      description: $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content'),
    };

    // Naive text extraction: remove scripts, styles, etc.
    $('script, style, nav, footer, header, aside').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    
    return {
      content: text.slice(0, 10000), // Updated to 10k context window
      og,
    };
  } catch (error) {
    console.warn(`Failed to fetch content for ${url}:`, error);
    return emptyResult;
  }
}
