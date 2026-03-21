# HN Daily AI Assistant

A personal AI chat assistant that scrapes Hacker News top stories, summarizes them in Traditional Chinese, and allows you to chat with the content using RAG (Retrieval-Augmented Generation).

## Demo

<video src="./assets/demo.mp4" controls="controls" style="max-width: 100%;">
  Your browser does not support the video tag.
</video>

## ✨ Features

- **Daily Scraper**: Fetches top 5 HN stories (Title, URL, Points).
- **AI Processing**:
  - Summarizes articles in Traditional Chinese using **Google Gemini 3.0 Flash**.
  - Generates vector embeddings for semantic search.
- **RAG Chat**: Chat interface to query daily news, powered by **Vercel AI SDK** and **Supabase (pgvector)**.
- **Tool Calling**: AI can fetch full article content on demand for deep analysis.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Database**: [Supabase](https://supabase.com/) (PostgreSQL + pgvector)
- **AI**: [Google Gemini API](https://ai.google.dev/) (via [Vercel AI SDK](https://sdk.vercel.ai/))
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)

## Setup

### 1. Environment Variables

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

Required variables:
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase Anon Key (public).
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase Service Role Key (for backend ingestion).
- `GOOGLE_GENERATIVE_AI_API_KEY`: Your Google Gemini API Key.
- `GOOGLE_GENERATIVE_AI_MODEL`: Your Google Gemini AI model.
- `GOOGLE_GENERATIVE_AI_EMBEDDING_MODEL`: Your Google Gemini embedding model.
- `CRON_SECRET`: A secret string to protect the ingestion API (optional but recommended).

### 2. Database Migration

Run the Supabase migrations to create the table and functions:

```bash
# If using Supabase CLI locally:
npm run supabase:migration:up

# Or manually run the SQL files in `supabase/migrations/` in your Supabase Dashboard SQL Editor.
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

### 1. Trigger Data Ingestion

To populate the database with today's stories, visit the API route manually (or set up a Cron job):

```
GET http://localhost:3000/api/hn-daily
```
*Note: If you set a `CRON_SECRET`, you must provide it in the `Authorization: Bearer <SECRET>` header.*

### 2. Chat

Go to the home page and start asking questions:
- "今天 HN 有什麼有趣的？"
- "請總結那篇關於 AI 的文章"
