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

export async function searchSimilarStories(queryEmbedding: number[]): Promise<HNContext[]> {
  try {
    const { data: documents, error } = await supabaseAdmin.rpc('match_hn_daily', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5, // Adjust based on testing
      match_count: 10,
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
