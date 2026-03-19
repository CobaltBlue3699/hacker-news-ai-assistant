# HN Daily AI Assistant 專案規格書

## 1. 專案概述
### 目標
建立一個個人專屬的 AI 聊天小幫手，主要功能為：
- **自動化抓取**：每天自動抓取 Hacker News (HN) 前 5 篇熱門故事。
- **內容處理**：產生簡短繁體中文總結並生成向量 Embedding。
- **資料儲存**：存入 Supabase 向量資料庫（pgvector）。
- **RAG 聊天介面**：使用者可透過聊天介面詢問 HN 相關內容，優先使用已存的每日精選資料（RAG）。
- **動態擴充**：當需要更多細節時，LLM 可主動觸發上網工具抓取完整文章。

### 使用者情境
- **晨間簡報**：每天早上查看最新的 HN 精選摘要。
- **深度詢問**：問「今天 HN 有什麼有趣的？」→ 透過 RAG 回答。
- **細節追蹤**：問「關於某篇技術文章的詳細內容？」→ LLM 觸發 `browse_page` 工具。

---

## 2. 功能範圍 (MVP)
### 核心功能
1.  **每日自動 HN 處理**：
    - 抓取欄位：`title`, `points`, `url`, `submission time`。
    - 生成：20–30 字繁體中文簡短總結。
    - Embedding：針對 `title` + `summary` 組合生成向量。
    - 儲存：Supabase `hn_daily` 表（以 `date` + `rank` 為 unique key）。
2.  **聊天介面 (RAG + Streaming)**：
    - 使用 Vercel AI SDK + `useChat` hook。
    - RAG：向量相似搜尋 `hn_daily` 表（top 5–10）。
    - System Prompt：引導 LLM 優先使用精選資料，除非明確要求細節。
    - Tool Calling：視需求呼叫 `browse_page` 或 `web_search`。

### 非目標 (Out of Scope for MVP)
- 多使用者支援。
- 即時 Push 通知。
- 複雜的代碼編寫或圖像生成功能。

---

## 3. 技術選型 (2026 推薦方案)

| 類別 | 選型 | 理由 |
| :--- | :--- | :--- |
| **前端框架** | **Next.js 15 (App Router)** | 原生支援 Server Actions, Streaming, Vercel 整合。 |
| **部署平台** | **Vercel** | Cron Jobs, Edge Functions, AI SDK 最佳路徑。 |
| **資料庫/向量** | **Supabase (Postgres + pgvector)** | 免費層級充足、自動 Embedding 機制、RLS 安全性。 |
| **LLM 主模型** | **Google Gemini 1.5-flash / 2.0-flash** | 高 Context Window、免費 Quota 高、繁中表現優。 |
| **Embedding** | **Gemini text-embedding-004** | 與生成模型高度相容，768 維度。 |
| **AI SDK** | **Vercel AI SDK** | 統一介面切換模型，Tool Calling 支援完善。 |
| **HTML 解析** | **Cheerio** | 輕量、Edge Runtime 相容、解析穩定。 |
| **排程** | **Vercel Cron Jobs** | 整合度高（或使用外部 cron-job.org）。 |

---

## 4. 系統架構與資料結構

### 系統流程
1.  **排程階段**：`Vercel Cron` -> `GET /api/hn-daily` -> 抓取解析 -> Gemini 總結/向量化 -> 存入 Supabase。
2.  **對話階段**：使用者 Query -> `api/chat` -> 向量搜尋 -> 建立 Context -> Gemini RAG 回答 (含 Tool Calling)。

### 資料表結構 (Supabase)
#### `hn_daily`
- `id`: serial PK
- `date`: date (not null)
- `rank`: smallint
- `title`: text
- `points`: integer
- `summary`: text
- `url`: text
- `embedding`: vector(768)
- `created_at`: timestamptz default now()
- **Index**: `hnsw` on `embedding` (vector_cosine_ops)

---

## 5. 注意事項與風險管理
- **Quota 風險**：監控 Gemini 免費額度，必要時備援 OpenAI 或本地 Embedding。
- **HN 結構變動**：定期檢查 `cheerio` selector (`.athing .titleline a`)。
- **安全**：使用 RLS (Row Level Security) 保護資料，聊天端僅開放 Read-only，寫入端限制 Service Role Key。
- **錯誤處理**：API Route 需實作 try-catch 並記錄失敗 Log，確保 Cron Job 狀態可追蹤。

---

## 6. 開發指引 (開發者必讀)
- **語氣要求**：所有對話與總結必須使用**繁體中文**，語氣專業且精煉。
- **測試優先**：在部署排程前，應先手動測試 `/api/hn-daily` 的抓取與寫入流程。
- **Surgical Updates**：修改代碼時應遵循最小更動原則，並確保類型安全 (TypeScript)。
