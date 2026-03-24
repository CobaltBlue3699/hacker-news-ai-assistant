'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, Globe, Loader2, ImageOff, AlertCircle } from 'lucide-react';
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
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fetchedRef = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const handleMouseEnter = () => {
    if (isTouchDevice) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    // 250ms delay for a snappier feel
    timeoutRef.current = setTimeout(() => {
      setIsOpen(true);
      fetchMetadata();
    }, 250);
  };

  const handleMouseLeave = () => {
    if (isTouchDevice) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    // 300ms delay before hiding to allow mouse travel to preview
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 300);
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    if (isTouchDevice && !isOpen) {
      e.preventDefault();
      setIsOpen(true);
      fetchMetadata();
    }
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

  // Close when clicking outside on mobile
  useEffect(() => {
    if (!isOpen || !isTouchDevice) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (previewRef.current && !previewRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isTouchDevice]);

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
        onClick={handleTriggerClick}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className={cn(
          "inline-flex items-center gap-1 font-bold transition-all underline decoration-2 underline-offset-2",
          isOpen ? "text-[#F97316] decoration-[#F97316]" : "decoration-current/20 hover:decoration-current/60",
          className
        )}
      >
        {children}
        <ExternalLink className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
      </a>

      {isOpen && (
        <div 
          ref={previewRef}
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-72 z-[100] animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200 origin-bottom pointer-events-auto"
          onMouseEnter={() => !isTouchDevice && timeoutRef.current && clearTimeout(timeoutRef.current)}
          onMouseLeave={handleMouseLeave}
        >
          <div className="bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl shadow-2xl shadow-slate-200/50 dark:shadow-black/60 ring-1 ring-slate-200/50 dark:ring-slate-700/50 overflow-hidden flex flex-col transition-all border border-white/20 dark:border-slate-800/50">
            
            {/* Image Area with Shimmer / Better States */}
            <div className="h-36 bg-slate-100/50 dark:bg-slate-800/50 relative w-full flex items-center justify-center overflow-hidden">
              {metadata.loading ? (
                <div className="flex flex-col items-center space-y-3">
                  <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest animate-pulse">Loading Preview</span>
                </div>
              ) : metadata.error ? (
                <div className="flex flex-col items-center text-red-400/60 space-y-2">
                  <AlertCircle className="h-8 w-8" />
                  <span className="text-[10px] uppercase tracking-widest font-bold">Preview Unavailable</span>
                </div>
              ) : metadata.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img 
                  src={metadata.image} 
                  alt={metadata.title || "Preview"} 
                  className="w-full h-full object-cover transition-all duration-700 ease-in-out scale-100 hover:scale-105"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    setMetadata(prev => ({ ...prev, image: undefined }));
                  }}
                />
              ) : (
                <div className="flex flex-col items-center text-slate-400/50 space-y-2">
                  <ImageOff className="h-8 w-8" />
                  <span className="text-[10px] uppercase tracking-widest font-bold">No Image</span>
                </div>
              )}
            </div>

            {/* Content Area */}
            <div className="p-4 space-y-2">
              <div className="flex items-center space-x-1.5 text-[10px] font-bold uppercase tracking-wider text-[#F97316]/70 dark:text-[#F97316]/90">
                <Globe className="h-3 w-3" />
                <span className="truncate max-w-[180px]">{domain}</span>
              </div>
              
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug line-clamp-2">
                {metadata.title || (metadata.loading ? 'Fetching Title...' : 'Hacker News Story')}
              </h4>
              
              {(metadata.description || isTouchDevice) && (
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed font-medium">
                  {metadata.description || "點擊標籤直接開啟原文。"}
                </p>
              )}

              {/* Mobile CTA */}
              {isTouchDevice && (
                <div className="pt-2">
                  <a 
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-full py-2 bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-bold rounded-lg transition-colors gap-1.5"
                  >
                    前往網站 <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </div>
          
          {/* Refined Arrow */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-[-6px] w-3 h-3 rotate-45 bg-white/95 dark:bg-slate-900/90 ring-1 ring-slate-200/50 dark:ring-slate-700/50 border-b border-r border-slate-200/50 dark:border-slate-700/50 z-40 backdrop-blur-xl" />
        </div>
      )}
    </span>
  );
}
