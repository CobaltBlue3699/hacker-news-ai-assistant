# Hacker News AI Assistant 專案技術文檔

本專案是一個整合了 Hacker News (HN) 內容抓取、AI 摘要生成以及 RAG (檢索增強生成) 技術的智慧助手。

## 1. 技術規格 (Tech Spec)

### 前端與框架
- **Next.js 16 (App Router)**: 使用最新版本進行開發。
- **Tailwind CSS 4**: 提供現代化的響應式 UI 設計。
- **Lucide React**: 圖標庫。

### AI 與 RAG
- **Vercel AI SDK**: 用於處理串流響應 (`streamText`) 與工具調用 (`tools`)。
- **Google Gemini 1.5 Flash**: 作為核心 LLM，平衡了速度與理解能力。
- **Embeddings**: 使用 Gemini 模型將文本轉換為向量。
- **Supabase (pgvector)**: 存儲新聞數據與向量值，實現語義搜索。

### 後端與爬蟲
- **Cheerio**: 用於抓取 HN 列表與文章網頁內容。
- **Supabase Client**: 負責與數據庫交互。
- **Vercel Cron**: 定期觸發同步任務。

---

## 2. 工作流程循序圖

### A. 定時同步流程 (Cron Job)
此流程負責維持數據庫中的新聞時效性。

```mermaid
sequenceDiagram
    participant Cron as Vercel Cron
    participant API as /api/hn-daily
    participant Scraper as HN Scraper
    participant AI as Gemini (Summarize/Embed)
    participant DB as Supabase (pgvector)

    Cron->>API: 每小時觸發 (GET)
    API->>Scraper: 抓取 Top Stories 列表
    Scraper-->>API: 回傳新聞標題與 URL
    
    loop 對於每篇熱門新聞
        API->>Scraper: 抓取文章內文
        Scraper-->>API: 回傳 HTML/Text
        API->>AI: 生成內容摘要 (Summary)
        AI-->>API: 回傳摘要內容
        API->>AI: 生成 (標題+摘要) 的向量 (Embedding)
        AI-->>API: 回傳 768 維向量
        API->>DB: Upsert 新聞數據、摘要與向量
    end
    
    API-->>Cron: 回傳處理結果
```

### B. 使用者提問與 RAG 流程 (User Interaction)
此流程展示了如何結合 RAG 與 Context 來回答使用者問題。

```mermaid
sequenceDiagram
    actor User as 使用者
    participant UI as Chat UI (React)
    participant API as /api/chat
    participant AI_Embed as Gemini (Embedding)
    participant DB as Supabase (Vector Search)
    participant AI_LLM as Gemini (Flash 1.5)
    participant Tool as Browse Page Tool

    User->>UI: 輸入提問 (例如: "今天有什麼 AI 新聞?")
    UI->>API: 發送消息 (POST)
    
    API->>AI_Embed: 將提問轉為向量
    AI_Embed-->>API: 回傳提問向量
    
    API->>DB: 搜尋相似向量 (Match hn_daily)
    DB-->>API: 回傳相關新聞摘要與 URL (Context)
    
    API->>AI_LLM: 提供 Context + 提問 + 歷史紀錄
    
    alt 需要更多細節 (Tool Call)
        AI_LLM->>Tool: 呼叫 browse_page(url)
        Tool->>API: 執行 Scraper 抓取全文
        API-->>AI_LLM: 回傳文章詳情
    end

    AI_LLM-->>UI: 串流回傳答案 (Traditional Chinese)
    UI-->>User: 顯示回覆
```

---

## 3. 數據庫結構 (Spec)

### `hn_daily` 資料表
| 欄位名 | 類型 | 說明 |
| :--- | :--- | :--- |
| id | uuid | 主鍵 |
| date | date | 新聞日期 (YYYY-MM-DD) |
| rank | int | 當日排名 (1-50) |
| title | text | 新聞標題 |
| url | text | 原始網址 |
| summary | text | AI 生成的摘要 |
| embedding | vector(768) | 標題與摘要的向量值 |
| points | int | HN 分數 |
| created_at | timestamp | 建立時間 |

---

## 4. 關鍵功能特點
1. **語義搜索**: 不僅僅是關鍵字比對，透過向量搜尋能理解使用者意圖（如搜尋「人工智慧」也能找到「LLM」相關新聞）。
2. **Context 注入**: 在 System Prompt 中注入檢索到的新聞，確保 AI 回答有據可依。
3. **即時工具調用**: 如果 RAG 提供的摘要不足，AI 可以動態決定去「閱讀」特定網頁以獲取更多資訊。
4. **自動化維護**: 透過 Cron Job 確保數據庫每日自動更新。
