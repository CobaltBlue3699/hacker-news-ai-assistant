import * as cheerio from 'cheerio';

export interface HNStory {
  rank: number;
  title: string;
  url: string;
  points: number;
  id: string;
  by?: string;
  time?: number;
  descendants?: number;
}

export interface OpenGraphData {
  image?: string;
  title?: string;
  description?: string;
}

export interface ArticleResult {
  content: string;
  comments: string[];
  og: OpenGraphData;
}

interface HNItemData {
  id?: number;
  type?: string;
  title?: string;
  url?: string;
  score?: number;
  by?: string;
  time?: number;
  descendants?: number;
  text?: string;
  kids?: number[];
}

export async function getTopStories(limit = 5): Promise<HNStory[]> {
  // Logs to preserve existing branding
  const startTime = Date.now();
  console.log(`[HN Scraper] Starting to fetch top ${limit} stories (Firebase API)...`);
  try {
    // 1) Get top story IDs via Firebase API
    const idsResp = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    if (!idsResp.ok) {
      console.error(`[HN Scraper] Failed to fetch top stories IDs: ${idsResp.status} ${idsResp.statusText}`);
      throw new Error(idsResp.statusText);
    }
    const ids: number[] = await idsResp.json();
    const topIds = ids.slice(0, limit);

    // 3) Concurrently fetch each item
    const items = await Promise.all(
      topIds.map(async (id, idx) => {
        try {
          const itemResp = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
          if (!itemResp.ok) {
            console.warn(`[HN Scraper] Failed to fetch item ${id}: ${itemResp.status} ${itemResp.statusText}`);
            return null;
          }
          const data: HNItemData = await itemResp.json();
          const story: HNStory = {
            rank: idx + 1,
            title: data?.title ?? '',
            url: data?.url ?? '',
            points: Number(data?.score ?? 0),
            id: String(data?.id ?? id),
            by: data?.by,
            time: data?.time,
            descendants: data?.descendants,
          };
          console.log(`[HN Scraper] Fetched story: [#${story.rank}] ${story.title} (ID: ${story.id})`);
          return story;
        } catch (err) {
          console.warn(`[HN Scraper] Error fetching item ${id}:`, err);
          return null;
        }
      })
    );

    // 4) Filter out any nulls due to individual fetch failures
    const stories = items.filter((s): s is HNStory => s !== null);

    const duration = Date.now() - startTime;
    console.log(`[HN Scraper] Successfully fetched ${stories.length} stories in ${duration}ms.`);
    return stories;
  } catch (error) {
    console.error('[HN Scraper] Error fetching top stories:', error);
    return [];
  }
}

// 新增可選的 hnItemId，使外部連結也能同時抓取 HN 熱門評論
export async function fetchArticleContent(url: string, hnItemId?: string): Promise<ArticleResult> {
  const startTime = Date.now();
  const emptyResult: ArticleResult = { content: '', comments: [], og: {} };

  if (!url) {
    console.warn('[HN Scraper] fetchArticleContent called with empty URL.');
    return emptyResult;
  }

  // 1) 內部連結：透過 Firebase API 獲取 item 詳情，使用 text 作為內容
  const isInternalHN = url.includes('news.ycombinator.com/item?id=') || url.startsWith('item?id=');
  const internalIdFromUrl = (() => {
    const m = url.match(/item\?id=(\d+)/);
    return m ? m[1] : null;
  })();
  const effectiveItemId = hnItemId ?? internalIdFromUrl;

  if (isInternalHN && effectiveItemId) {
    console.log(`[HN Scraper] Internal HN article detected. Fetching via Firebase for item ${effectiveItemId}...`);
    try {
      const itemResp = await fetch(`https://hacker-news.firebaseio.com/v0/item/${effectiveItemId}.json`);
      if (itemResp.ok) {
        const item: HNItemData = await itemResp.json();
        const content = typeof item?.text === 'string' ? item.text : '';
        const og: OpenGraphData = {};
        const comments = await extractHNComments(effectiveItemId);
        const duration = Date.now() - startTime;
        console.log(`[HN Scraper] Internal content fetched for item ${effectiveItemId} in ${duration}ms.`);
        return { content, comments, og };
      } else {
        console.warn(`[HN Scraper] Failed to fetch item ${effectiveItemId}: ${itemResp.status} ${itemResp.statusText}`);
        return emptyResult;
      }
    } catch (err) {
      console.warn(`[HN Scraper] Error fetching internal item ${effectiveItemId}:`, err);
      return emptyResult;
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7',
      },
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      console.warn(`[HN Scraper] Failed to fetch external content: ${response.status} ${response.statusText}`);
      return emptyResult;
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    const og: OpenGraphData = {
      image: $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content'),
      title: $('meta[property="og:title"]').attr('content') || $('title').text(),
      description: $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content'),
    };

    $('script, style, nav, footer, header, aside, noscript, iframe, .ads, .sidebar, .menu, .footer, .nav').remove();

    const mainContent = $('main, article, #content, .content, .post-content').first();
    let content = mainContent.length > 0 ? mainContent.text() : $('body').text();
    content = content.replace(/\s+/g, ' ').trim().substring(0, 10000);

    const comments = effectiveItemId ? await extractHNComments(effectiveItemId) : [];

    const duration = Date.now() - startTime;
    console.log(`[HN Scraper] External content fetched in ${duration}ms.`);
    return { content, comments, og };
  } catch (err) {
    console.warn('[HN Scraper] Error fetching external content:', err);
    return emptyResult;
  }
}

interface HNCommentData {
  id: number;
  text?: string;
  by?: string;
  time?: number;
  kids?: number[];
}

async function extractHNComments(hnItemId: string): Promise<string[]> {
  const startTime = Date.now();
  const comments: string[] = [];
  if (!hnItemId) {
    console.warn('[HN Scraper] extractHNComments called with empty hnItemId.');
    return comments;
  }
  const loggerPrefix = `[HN Scraper] extractHNComments item ${hnItemId}`;
  
  try {
    console.log(`${loggerPrefix} - starting fetch...`);
    const itemUrl = `https://hacker-news.firebaseio.com/v0/item/${hnItemId}.json`;
    const itemResp = await fetch(itemUrl);
    if (!itemResp.ok) {
      console.warn(`${loggerPrefix}: failed to fetch item (${itemResp.status})`);
      return comments;
    }
    const itemData: { kids?: number[] } = await itemResp.json();
    const kids: number[] = Array.isArray(itemData?.kids) ? itemData.kids : [];
    
    const fetchCount = Math.min(30, kids.length);
    const commentPromises = kids.slice(0, fetchCount).map(async (kidId) => {
      try {
        const kidResp = await fetch(`https://hacker-news.firebaseio.com/v0/item/${kidId}.json`);
        if (!kidResp.ok) return null;
        const data: HNCommentData = await kidResp.json();
        return { ...data, id: kidId };
      } catch {
        return null;
      }
    });

    const rawComments = (await Promise.all(commentPromises)).filter((c): c is HNCommentData & { id: number } => c !== null && !!c.text);
    
    const scored = rawComments.map(c => ({
      ...c,
      replyCount: c.kids?.length ?? 0,
      isEarly: (c.time ?? 0) > 0,
    }));
    scored.sort((a, b) => b.replyCount - a.replyCount);
    
    const valuable = scored.slice(0, 15);

    for (const c of valuable) {
      const age = c.time ? formatCommentAge(c.time) : '';
      const meta = `[${c.by || 'anonymous'}${age ? ', ' + age : ''}${c.replyCount > 0 ? ', ' + c.replyCount + ' replies' : ''}]`;
      let text = `${meta}\n${c.text}`;
      
      if (c.kids && c.kids.length > 0) {
        try {
          const replyResp = await fetch(`https://hacker-news.firebaseio.com/v0/item/${c.kids[0]}.json`);
          if (replyResp.ok) {
            const replyData: HNCommentData = await replyResp.json();
            if (replyData.text) {
              text += `\n  └─ [Reply by ${replyData.by || '?'}]: ${replyData.text}`;
            }
          }
        } catch { }
      }
      comments.push(text);
    }

    const duration = Date.now() - startTime;
    console.log(`[HN Scraper] ${loggerPrefix}: fetched ${comments.length} valuable comments from ${rawComments.length} total in ${duration}ms.`);
  } catch (error) {
    console.error(`[HN Scraper] ${loggerPrefix}: Error extracting comments:`, error);
  }
  return comments;
}

function formatCommentAge(unixTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diffSeconds = now - unixTime;
  const hours = Math.floor(diffSeconds / 3600);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
