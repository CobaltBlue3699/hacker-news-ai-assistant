CREATE OR REPLACE FUNCTION match_hn_daily (
  query_embedding extensions.vector(768), -- 使用 extensions.vector
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id int,
  date date,
  rank smallint,
  title text,
  points int,
  summary text,
  url text,
  similarity float
)
LANGUAGE sql STABLE
-- 關鍵修正：設定搜尋路徑，讓函式能找到 extensions 裡的 <=> 運算子
SET search_path = public, extensions
AS $$
  SELECT
    hn_daily.id,
    hn_daily.date,
    hn_daily.rank,
    hn_daily.title,
    hn_daily.points,
    hn_daily.summary,
    hn_daily.url,
    1 - (hn_daily.embedding <=> query_embedding) AS similarity
  FROM hn_daily
  WHERE 1 - (hn_daily.embedding <=> query_embedding) > match_threshold
  ORDER BY hn_daily.embedding <=> query_embedding ASC
  LIMIT LEAST(match_count, 50);
$$;