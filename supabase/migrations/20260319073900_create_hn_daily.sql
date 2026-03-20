-- 啟用向量擴充功能
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 建立 hn_daily 表
CREATE TABLE IF NOT EXISTS public.hn_daily (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    rank SMALLINT NOT NULL,
    title TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    summary TEXT,
    url TEXT,
    embedding VECTOR (768), -- Gemini text-embedding 使用 768 維度 (pgvector HNSW 限制為 2000)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- 確保每天的排名是唯一的
    UNIQUE (date, rank)
);

-- 建立向量索引 (HNSW) 以優化 RAG 搜尋效能
CREATE INDEX IF NOT EXISTS hn_daily_embedding_idx ON public.hn_daily USING hnsw (embedding vector_cosine_ops);

-- 開啟 RLS 安全設定
ALTER TABLE public.hn_daily ENABLE ROW LEVEL SECURITY;

-- 建立讀取權限 (任何人皆可讀取)
CREATE POLICY "Allow public read access" ON public.hn_daily FOR
SELECT TO anon, authenticated USING (true);