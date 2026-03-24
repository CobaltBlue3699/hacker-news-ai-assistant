-- 先移除舊版 (3個參數) 的函式，避免因為函式重載導致重複
DROP FUNCTION IF EXISTS match_hn_daily(extensions.vector, float, int);

CREATE OR REPLACE FUNCTION match_hn_daily (
  query_embedding extensions.vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  start_date date DEFAULT NULL,
  end_date date DEFAULT NULL
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
-- 安全性修正：明確設定 search_path 以防止 Search Path Hijacking
SET search_path = public, extensions, pg_temp
AS $$
  SELECT
    id,
    date,
    rank,
    title,
    points,
    summary,
    url,
    1 - (embedding <=> query_embedding) AS similarity
  FROM public.hn_daily
  WHERE 
    (1 - (embedding <=> query_embedding) > match_threshold)
    AND (start_date IS NULL OR date >= start_date)
    AND (end_date IS NULL OR date <= end_date)
  ORDER BY embedding <=> query_embedding ASC
  LIMIT LEAST(match_count, 50);
$$;