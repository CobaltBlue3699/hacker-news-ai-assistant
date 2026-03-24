import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // 1. Try to find existing metadata in our database
    const { data, error } = await supabaseAdmin
      .from('hn_daily')
      .select('og_image, og_title, og_description')
      .eq('url', url)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows found"
      console.error('Database error:', error);
    }

    if (data) {
      return NextResponse.json({
        image: data.og_image,
        title: data.og_title,
        description: data.og_description,
        source: 'database'
      });
    }

    // 2. If not found in DB (e.g. ad-hoc link), return basic info or empty
    // Ideally, we could fetch OG data on the fly here, but to keep it fast/simple
    // for MVP, we'll just return null if not in our daily curated list.
    return NextResponse.json({ error: 'Metadata not found' }, { status: 404 });

  } catch (error) {
    console.error('Metadata API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
