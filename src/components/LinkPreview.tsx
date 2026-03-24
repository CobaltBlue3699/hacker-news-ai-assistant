'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, Globe, Loader2, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LinkPreviewProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

interface Metadata {
  image?: string;
  title?: string;
  description?: string;
  loading: boolean;
  error?: boolean;
}

export function LinkPreview({ href, children, className }: LinkPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [metadata, setMetadata] = useState<Metadata>({ loading: true });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fetchedRef = useRef(false);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    // 300ms delay before showing
    timeoutRef.current = setTimeout(() => {
      setIsOpen(true);
      fetchMetadata();
    }, 300);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    // 300ms delay before hiding
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 300);
  };

  const fetchMetadata = async () => {
    if (fetchedRef.current || !href) return;
    
    try {
      const res = await fetch(`/api/metadata?url=${encodeURIComponent(href)}`);
      if (!res.ok) throw new Error('Failed');
      
      const data = await res.json();
      setMetadata({
        image: data.image,
        title: data.title,
        description: data.description,
        loading: false
      });
      fetchedRef.current = true;
    } catch (e) {
      setMetadata({ loading: false, error: true });
      fetchedRef.current = true; // Don't retry
    }
  };

  // Extract domain for display
  const domain = href ? new URL(href).hostname.replace('www.', '') : '';

  return (
    <span 
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <a 
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(className, "inline-flex items-center gap-1 font-bold transition-all underline decoration-2 underline-offset-2")}
      >
        {children}
        <ExternalLink className="h-3.5 w-3.5 opacity-70" />
      </a>

      {isOpen && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 z-50 animate-in fade-in zoom-in-95 duration-200 origin-bottom">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl ring-1 ring-slate-200/50 dark:ring-slate-700/50 overflow-hidden flex flex-col">
            
            {/* Image Area */}
            <div className="h-36 bg-slate-100 dark:bg-slate-800 relative w-full flex items-center justify-center overflow-hidden">
              {metadata.loading ? (
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              ) : metadata.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img 
                  src={metadata.image} 
                  alt="Preview" 
                  className="w-full h-full object-cover transition-opacity duration-300"
                  onError={(e) => {
                    // Fallback on image load error
                    e.currentTarget.style.display = 'none';
                    setMetadata(prev => ({ ...prev, image: undefined }));
                  }}
                />
              ) : (
                <div className="flex flex-col items-center text-slate-400 space-y-2">
                  <ImageOff className="h-8 w-8 opacity-50" />
                  <span className="text-xs uppercase tracking-wider font-medium opacity-70">No Preview</span>
                </div>
              )}
            </div>

            {/* Text Content */}
            <div className="p-3 space-y-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
              <div className="flex items-center space-x-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <Globe className="h-3 w-3" />
                <span className="truncate max-w-[180px]">{domain}</span>
              </div>
              
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug line-clamp-2">
                {metadata.title || (metadata.loading ? 'Loading...' : 'Link Preview')}
              </h4>
              
              {metadata.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                  {metadata.description}
                </p>
              )}
            </div>
          </div>
          
          {/* Arrow */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-[-6px] w-3 h-3 rotate-45 bg-white dark:bg-slate-900 ring-1 ring-slate-200/50 dark:ring-slate-700/50 border-b border-r border-slate-200/50 dark:border-slate-700/50 z-40" />
        </div>
      )}
    </span>
  );
}
