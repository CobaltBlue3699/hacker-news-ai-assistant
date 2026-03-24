-- Add Open Graph fields to hn_daily table for link previews
ALTER TABLE public.hn_daily
ADD COLUMN IF NOT EXISTS og_image TEXT,
ADD COLUMN IF NOT EXISTS og_title TEXT,
ADD COLUMN IF NOT EXISTS og_description TEXT;

-- Create an index on og_image to quickly filter stories with images (optional but good for future UI filtering)
CREATE INDEX IF NOT EXISTS hn_daily_og_image_idx ON public.hn_daily (og_image) WHERE og_image IS NOT NULL;
