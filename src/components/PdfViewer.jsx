// Author: Claude Sonnet 4.6
// PdfViewer — minimal canvas-based PDF renderer using pdfjs-dist.
// Renders all pages in a scrollable column. No toolbar, no keyboard capture.

import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './PdfViewer.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function filePathFromUri(uri) {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

export default function PdfViewer({ uri }) {
  const [pdf, setPdf]           = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [error, setError]       = useState(null);

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    setPdf(null);
    setError(null);

    const load = async () => {
      try {
        let source;
        if (uri.startsWith('file://')) {
          // Read via IPC to bypass cross-origin restrictions in dev mode
          const filePath = filePathFromUri(uri);
          const buffer = await window.electronAPI.fs.readFile(filePath);
          source = { data: new Uint8Array(buffer) };
        } else {
          source = { url: uri };
        }
        const doc = await pdfjsLib.getDocument(source).promise;
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [uri]);

  const scrollRef  = useRef(null);
  const rafRef     = useRef(null);
  const dirRef     = useRef(0);

  useEffect(() => { scrollRef.current?.focus(); }, [pdf]);

  const SPEED = 5; // px per frame

  const startScroll = (dir) => {
    if (dirRef.current === dir) return;
    dirRef.current = dir;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = () => {
      scrollRef.current?.scrollBy({ top: dirRef.current * SPEED });
      if (dirRef.current !== 0) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const stopScroll = () => {
    dirRef.current = 0;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  };

  useEffect(() => stopScroll, []); // cancel on unmount

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault(); startScroll(1);
    } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault(); startScroll(-1);
    }
  };

  const handleKeyUp = (e) => {
    if (['ArrowDown','ArrowUp','s','S','w','W'].includes(e.key)) stopScroll();
  };

  if (error) return <div className="pdf-error">Could not load PDF</div>;
  if (!pdf)  return <div className="pdf-loading">Loading…</div>;

  return (
    <div
      ref={scrollRef}
      className="pdf-scroll"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      {Array.from({ length: numPages }, (_, i) => (
        <PdfPage key={i} pdf={pdf} pageNumber={i + 1} />
      ))}
    </div>
  );
}

function PdfPage({ pdf, pageNumber }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask = null;

    pdf.getPage(pageNumber).then(page => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const containerWidth = canvas.parentElement?.clientWidth || 680;
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = containerWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });

      const dpr = window.devicePixelRatio || 1;
      const scaledViewport = page.getViewport({ scale: scale * dpr });

      canvas.width  = scaledViewport.width;
      canvas.height = scaledViewport.height;
      canvas.style.width  = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext('2d');
      renderTask = page.render({ canvasContext: ctx, viewport: scaledViewport });
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageNumber]);

  return <canvas ref={canvasRef} className="pdf-page" />;
}
