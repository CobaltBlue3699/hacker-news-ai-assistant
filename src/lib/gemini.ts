import { createGoogleGenerativeAI } from '@ai-sdk/google';

// Google Provider
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

// Helper models
export const geminiFlashModel = google('gemini-2.5-flash');
// Embedding model
export const geminiEmbeddingModel = google.embeddingModel('gemini-embedding-001');
