import { supabaseAdmin } from '@/lib/supabase';

export interface HNContext {
  id: number;
  title: string;
  summary: string;
  url: string;
  date: string;
  rank: number;
  points: number;
  similarity: number;
}

export async function searchSimilarStories(
  queryEmbedding: number[],
  startDate?: string,
  endDate?: string
): Promise<HNContext[]> {
  try {
    const { data: documents, error } = await supabaseAdmin.rpc('match_hn_daily', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3, // Lowered slightly to capture more relevant topics across days
      match_count: 10,
      start_date: startDate || null,
      end_date: endDate || null,
    });

    if (error) {
      console.error('Error searching similar stories:', error);
      // If the RPC doesn't exist yet, we might need to create it.
      // But usually we just use the vector filter if the library supports it,
      // but Supabase vector search usually requires an RPC for cosine similarity.
      return [];
    }

    return (documents as HNContext[]).map((doc: HNContext) => ({
      id: doc.id,
      title: doc.title,
      summary: doc.summary,
      url: doc.url,
      date: doc.date,
      rank: doc.rank,
      points: doc.points,
      similarity: doc.similarity,
    }));
  } catch (error) {
    console.error('RAG search failed:', error);
    return [];
  }
}
