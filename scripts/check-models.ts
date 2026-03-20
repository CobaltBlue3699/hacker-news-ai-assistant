import * as dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

interface GoogleModel {
  name: string;
  displayName: string;
  supportedGenerationMethods: string[];
}

async function checkModels() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ Error: GOOGLE_GENERATIVE_AI_API_KEY not found in .env file');
    process.exit(1);
  }

  console.log('🔍 Fetching available Google Generative AI models...\n');

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ API Request Failed:', response.status, response.statusText);
      console.error(JSON.stringify(errorData, null, 2));
      return;
    }

    const data = await response.json() as { models?: GoogleModel[] };
    const models = data.models || [];

    console.log(`✅ Successfully retrieved ${models.length} models.\n`);

    const generationModels = models.filter((m: GoogleModel) => 
      m.supportedGenerationMethods.includes('generateContent')
    );

    const embeddingModels = models.filter((m: GoogleModel) => 
      m.supportedGenerationMethods.includes('embedContent')
    );

    console.log('🤖 [Generation Models]');
    generationModels.forEach((m: GoogleModel) => {
      console.log(` - ${m.name.replace('models/', '')} (${m.displayName})`);
    });

    console.log('\n📐 [Embedding Models]');
    embeddingModels.forEach((m: GoogleModel) => {
      console.log(` - ${m.name.replace('models/', '')} (${m.displayName})`);
    });

    console.log('\n💡 Recommendation: Use the exact short name (e.g., "gemini-1.5-flash") in your code.');

  } catch (error) {
    console.error('❌ An unexpected error occurred:', error);
  }
}

checkModels();
