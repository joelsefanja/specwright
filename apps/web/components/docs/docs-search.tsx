"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface SearchResult {
  url: string;
  meta: { title: string };
  excerpt: string;
}

interface PagefindResult {
  url: string;
  meta: () => Promise<{ title: string }>;
  excerpt: () => Promise<string>;
}

interface PagefindInstance {
  search: (query: string) => Promise<{ results: PagefindResult[] }>;
}

declare global {
  interface Window {
    pagefind?: PagefindInstance;
  }
}

export function DocsSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setLoading(false);
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      setLoading(false);
    }
  };

  // Load pagefind at runtime — file only exists after `next build && pagefind …`
  const loadPagefind = useCallback(async () => {
    if (window.pagefind) return;
    try {
      // Dynamic fetch avoids bundler analysis; pagefind is a built artifact
      const resp = await fetch("/pagefind/pagefind.js");
      if (!resp.ok) return; // dev mode — index not built
      const src = await resp.text();
      const mod = await new Function(`return import('data:text/javascript,' + encodeURIComponent(${JSON.stringify(src)}))`)();
      window.pagefind = mod as PagefindInstance;
    } catch {
      // silent — pagefind not available in dev mode
    }
  }, []);

  // Keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) closeSearch();
        else setOpen(true);
      }
      if (e.key === "Escape") closeSearch();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, closeSearch]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      loadPagefind();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, loadPagefind]);

  // Run search
  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      await loadPagefind();
      if (cancelled) return;
      if (!window.pagefind) {
        setLoading(false);
        return;
      }
      const raw = await window.pagefind.search(trimmedQuery);
      const resolved = await Promise.all(
        raw.results.slice(0, 8).map(async (r) => ({
          url: r.url,
          meta: await r.meta(),
          excerpt: await r.excerpt(),
        }))
      );
      if (cancelled) return;
      setResults(resolved);
      setLoading(false);
    };
    const t = setTimeout(run, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, loadPagefind]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        closeSearch();
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, closeSearch]);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300 transition-colors text-sm min-w-[160px]"
        aria-label="Search documentation"
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx={11} cy={11} r={8} />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <span className="flex-1 text-left">Search docs</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 text-xs text-slate-600 bg-slate-800 rounded px-1 py-0.5 font-mono">
          ⌘K
        </kbd>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-950/80 backdrop-blur-sm">
          <div
            ref={dialogRef}
            className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700">
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx={11} cy={11} r={8} />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Search documentation…"
                className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-sm"
              />
              {loading && (
                <svg className="w-4 h-4 text-slate-500 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={4} />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              <kbd
                className="text-xs text-slate-600 bg-slate-800 rounded px-1.5 py-0.5 font-mono cursor-pointer"
                onClick={closeSearch}
              >
                Esc
              </kbd>
            </div>

            {/* Results */}
            {results.length > 0 && (
              <ul className="max-h-80 overflow-y-auto divide-y divide-slate-800">
                {results.map((r) => (
                  <li key={r.url}>
                      <Link
                        href={r.url}
                        onClick={closeSearch}
                      className="flex flex-col gap-1 px-4 py-3 hover:bg-slate-800 transition-colors"
                    >
                      <span className="text-sm font-medium text-slate-200">{r.meta.title}</span>
                      <span
                        className="text-xs text-slate-400 line-clamp-2 [&_mark]:bg-violet-500/30 [&_mark]:text-violet-300 [&_mark]:rounded"
                        dangerouslySetInnerHTML={{ __html: r.excerpt }}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {/* Empty state */}
            {query && !loading && results.length === 0 && (
              <p className="px-4 py-6 text-sm text-slate-500 text-center">
                No results for <span className="text-slate-300">&ldquo;{query}&rdquo;</span>
              </p>
            )}

            {/* No query state */}
            {!query && (
              <p className="px-4 py-4 text-xs text-slate-600 text-center">
                Type to search all documentation pages
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
