import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Util, type PDFDocumentProxy } from 'pdfjs-dist';
import {
  PdfHighlighter,
  PdfLoader,
  type IHighlight,
} from 'react-pdf-highlighter';
import 'react-pdf-highlighter/dist/style.css';
import type { ProcurementTemplateField } from '../types';

const pdfHighlighterWorkerUrl = '/pdfjs-worker-4.4.168/pdf.worker.min.mjs';
const emptyPdfHighlights: IHighlight[] = [];
const emptyFieldLocations: Record<string, TemplatePdfFieldLocation> = {};
const emptyPageTaskLocations: Record<string, TemplatePdfFieldLocation> = {};
const emptyPageTaskAnchors: TemplatePdfPageTaskAnchorTarget[] = [];
const emptyPageTaskFillValues: Record<string, TemplatePdfPageTaskFillTarget | undefined> = {};
const pdfTextIndexCache = new WeakMap<PDFDocumentProxy, Map<number, Promise<PdfPageTextIndex>>>();
const noopPdfHandler = () => undefined;
const noopSelectionFinished = () => null;

export interface TemplatePdfRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TemplatePdfFieldLocation {
  fieldId: string;
  page: number;
  rect: TemplatePdfRect | null;
  found: boolean;
  matchText: string;
  matchIndex?: number;
}

export interface TemplatePdfPageTaskAnchorTarget {
  id: string;
  taskKey: string;
  label: string;
  page: number;
  matchText: string;
  sourceText: string;
}

export interface TemplatePdfPageTaskFillTarget {
  taskKey: string;
  value: string;
  status: string;
  confidence?: number;
}

interface OpenSourcePdfHighlighterPreviewProps {
  pdfUrl: string;
  templateId?: string;
  fields: ProcurementTemplateField[];
  selectedFieldId: string;
  onSelectedFieldChange: (fieldId: string) => void;
  onFieldLocationsChange: (locations: Record<string, TemplatePdfFieldLocation>) => void;
  onPageChange: (page: number) => void;
  pageTaskAnchors?: TemplatePdfPageTaskAnchorTarget[];
  selectedPageTaskAnchorId?: string;
  onPageTaskAnchorLocationsChange?: (locations: Record<string, TemplatePdfFieldLocation>) => void;
  pageTaskFillValues?: Record<string, TemplatePdfPageTaskFillTarget | undefined>;
}

interface PdfOutlineNode {
  id: string;
  title: string;
  page: number | null;
  level: number;
}

interface PdfOutlineRawNode {
  title?: string;
  dest?: unknown;
  items?: PdfOutlineRawNode[];
}

interface OpenSourcePdfHighlighterBodyProps {
  pdfDocument: PDFDocumentProxy;
  hostRef: RefObject<HTMLDivElement | null>;
  fields: ProcurementTemplateField[];
  locations: Record<string, TemplatePdfFieldLocation>;
  pageTaskAnchors: TemplatePdfPageTaskAnchorTarget[];
  pageTaskAnchorLocations: Record<string, TemplatePdfFieldLocation>;
  pageTaskFillValues: Record<string, TemplatePdfPageTaskFillTarget | undefined>;
  detectedHighlightCount: number;
  selectedFieldId: string;
  selectedPageTaskAnchorId: string;
  onSelectedFieldChange: (fieldId: string) => void;
  onLocationsChange: (locations: Record<string, TemplatePdfFieldLocation>) => void;
  onPageTaskAnchorLocationsChange: (locations: Record<string, TemplatePdfFieldLocation>) => void;
  onPageChange: (page: number) => void;
}

interface PdfTextEntry {
  start: number;
  end: number;
  rect: TemplatePdfRect;
}

interface PdfPageTextIndex {
  pageNumber: number;
  width: number;
  height: number;
  compactText: string;
  entries: PdfTextEntry[];
}

function toPdfData(value: ArrayBuffer | Uint8Array | number[]) {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  return new Uint8Array(value);
}

async function createLoadablePdfUrl(pdfUrl: string, templateId?: string) {
  if (window.yibiao?.procurementAgent?.readTemplatePdf && templateId) {
    const data = toPdfData(await window.yibiao.procurementAgent.readTemplatePdf({ templateId }));
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
    return URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
  }
  return pdfUrl;
}

function compactPdfText(value: string) {
  return String(value || '')
    .replace(/[：]/g, ':')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/\s+/g, '')
    .trim();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map(compactPdfText).filter((value) => value.length >= 2))];
}

function createFieldCandidates(field: ProcurementTemplateField) {
  const sourceText = field.sourceText || '';
  const sourceParts = sourceText
    .split(/[。；;，,\n\r]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);

  return uniqueStrings([
    sourceText,
    ...sourceParts,
    `${field.placeholder || field.label}:`,
    `${field.label}:`,
    field.placeholder || '',
    field.label,
  ]).sort((first, second) => second.length - first.length);
}

function createTextRect(item: Record<string, unknown>, viewport: { transform: number[]; scale: number }): TemplatePdfRect {
  const transform = Util.transform(viewport.transform, item.transform as number[]);
  const text = String(item.str || '');
  const fontHeight = Math.max(8, Math.hypot(transform[2], transform[3]));
  const rawWidth = Number(item.width || 0);
  const width = Math.max(8, rawWidth * viewport.scale, text.length * fontHeight * 0.56);
  return {
    left: transform[4],
    top: transform[5] - fontHeight,
    width,
    height: fontHeight * 1.2,
  };
}

function mergeRects(rects: TemplatePdfRect[]) {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
  const padding = 3;
  return {
    left: Math.max(0, left - padding),
    top: Math.max(0, top - padding),
    width: right - left + padding * 2,
    height: bottom - top + padding * 2,
  };
}

function normalizeRect(rect: TemplatePdfRect, pageWidth: number, pageHeight: number) {
  return {
    left: rect.left / pageWidth,
    top: rect.top / pageHeight,
    width: rect.width / pageWidth,
    height: rect.height / pageHeight,
  };
}

async function createPageTextIndex(pdfDocument: PDFDocumentProxy, pageNumber: number): Promise<PdfPageTextIndex> {
  const page = await pdfDocument.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent();
  let cursor = 0;
  const entries: PdfTextEntry[] = [];
  const compactParts: string[] = [];

  textContent.items.forEach((item) => {
    const pdfItem = item as Record<string, unknown>;
    const compact = compactPdfText(String(pdfItem.str || ''));
    if (!compact) return;
    const start = cursor;
    const end = start + compact.length;
    cursor = end;
    entries.push({
      start,
      end,
      rect: createTextRect(pdfItem, viewport),
    });
    compactParts.push(compact);
  });

  return {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    compactText: compactParts.join(''),
    entries,
  };
}

function getCachedPageTextIndex(pdfDocument: PDFDocumentProxy, pageNumber: number) {
  let documentCache = pdfTextIndexCache.get(pdfDocument);
  if (!documentCache) {
    documentCache = new Map();
    pdfTextIndexCache.set(pdfDocument, documentCache);
  }
  const cached = documentCache.get(pageNumber);
  if (cached) return cached;
  const pending = createPageTextIndex(pdfDocument, pageNumber).catch((error) => {
    documentCache?.delete(pageNumber);
    throw error;
  });
  documentCache.set(pageNumber, pending);
  return pending;
}

function findCandidateInPage(field: ProcurementTemplateField, pageIndex: PdfPageTextIndex, candidate: string, minIndex: number) {
  const start = pageIndex.compactText.indexOf(candidate, minIndex);
  if (start < 0) return null;
  const end = start + candidate.length;
  const rects = pageIndex.entries
    .filter((entry) => entry.end > start && entry.start < end)
    .map((entry) => entry.rect);
  if (!rects.length) return null;
  const merged = mergeRects(rects);
  return {
    fieldId: field.id,
    page: pageIndex.pageNumber,
    rect: normalizeRect(merged, pageIndex.width, pageIndex.height),
    found: true,
    matchText: candidate,
    matchIndex: start,
  };
}

function findAnchorCandidateInPage(anchor: TemplatePdfPageTaskAnchorTarget, pageIndex: PdfPageTextIndex, candidate: string) {
  const start = pageIndex.compactText.indexOf(candidate);
  if (start < 0) return null;
  const end = start + candidate.length;
  const rects = pageIndex.entries
    .filter((entry) => entry.end > start && entry.start < end)
    .map((entry) => entry.rect);
  if (!rects.length) return null;
  const merged = mergeRects(rects);
  return {
    fieldId: anchor.id,
    page: pageIndex.pageNumber,
    rect: normalizeRect(merged, pageIndex.width, pageIndex.height),
    found: true,
    matchText: candidate,
    matchIndex: start,
  };
}

async function createPdfTextIndexes(pdfDocument: PDFDocumentProxy, pageNumbers?: number[]) {
  const requestedPages = pageNumbers?.length
    ? [...new Set(pageNumbers.filter((pageNumber) => pageNumber >= 1 && pageNumber <= pdfDocument.numPages))].sort((first, second) => first - second)
    : Array.from({ length: pdfDocument.numPages }, (_item, index) => index + 1);
  const pageIndexes: PdfPageTextIndex[] = [];
  for (const pageNumber of requestedPages) {
    pageIndexes.push(await getCachedPageTextIndex(pdfDocument, pageNumber));
  }
  return pageIndexes;
}

async function locateFields(pdfDocument: PDFDocumentProxy, fields: ProcurementTemplateField[]) {
  if (!fields.length) return emptyFieldLocations;
  const pageIndexes = await createPdfTextIndexes(pdfDocument);

  const locations: Record<string, TemplatePdfFieldLocation> = {};
  let nextSearchPage = 1;
  let nextSearchIndex = 0;

  [...fields].sort((first, second) => first.blockOrder - second.blockOrder).forEach((field) => {
    let location: TemplatePdfFieldLocation | null = null;
    const candidates = createFieldCandidates(field);
    for (const candidate of candidates) {
      for (const pageIndex of pageIndexes) {
        if (pageIndex.pageNumber < nextSearchPage) continue;
        const minIndex = pageIndex.pageNumber === nextSearchPage ? nextSearchIndex : 0;
        location = findCandidateInPage(field, pageIndex, candidate, minIndex);
        if (location) break;
      }
      if (location) break;
    }

    if (location) {
      locations[field.id] = location;
      nextSearchPage = location.page;
      nextSearchIndex = (location.matchIndex || 0) + location.matchText.length;
    } else {
      locations[field.id] = {
        fieldId: field.id,
        page: 0,
        rect: null,
        found: false,
        matchText: '',
      };
    }
  });

  return locations;
}

async function locatePageTaskAnchors(pdfDocument: PDFDocumentProxy, anchors: TemplatePdfPageTaskAnchorTarget[]) {
  if (!anchors.length) return emptyPageTaskLocations;
  const pageHints = anchors.map((anchor) => Number(anchor.page || 0)).filter(Boolean);
  const pageIndexes = await createPdfTextIndexes(pdfDocument, pageHints.length ? pageHints : undefined);
  const pageIndexByNumber = new Map(pageIndexes.map((pageIndex) => [pageIndex.pageNumber, pageIndex]));
  const locations: Record<string, TemplatePdfFieldLocation> = {};

  anchors.forEach((anchor) => {
    const preferredPage = pageIndexByNumber.get(anchor.page);
    const candidates = uniqueStrings([
      anchor.sourceText,
      anchor.matchText,
      ...String(anchor.sourceText || '')
        .split(/[。；;，,\n\r]/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2),
    ]).sort((first, second) => second.length - first.length);
    let location: TemplatePdfFieldLocation | null = null;
    const searchPages = preferredPage ? [preferredPage] : pageIndexes;
    for (const candidate of candidates) {
      for (const pageIndex of searchPages) {
        location = findAnchorCandidateInPage(anchor, pageIndex, candidate);
        if (location) break;
      }
      if (location) break;
    }
    locations[anchor.id] = location || {
      fieldId: anchor.id,
      page: anchor.page || 0,
      rect: null,
      found: false,
      matchText: '',
    };
  });

  return locations;
}

async function resolveOutlinePage(pdfDocument: PDFDocumentProxy, dest: unknown) {
  try {
    const destination = typeof dest === 'string' ? await pdfDocument.getDestination(dest) : dest;
    if (!Array.isArray(destination) || !destination[0]) return null;
    const pageIndex = await pdfDocument.getPageIndex(destination[0] as Parameters<PDFDocumentProxy['getPageIndex']>[0]);
    return pageIndex + 1;
  } catch {
    return null;
  }
}

async function flattenPdfOutline(pdfDocument: PDFDocumentProxy) {
  const outline = await pdfDocument.getOutline();
  if (!outline?.length) return [];
  const nodes: PdfOutlineNode[] = [];
  let order = 0;

  async function visit(items: PdfOutlineRawNode[], level: number) {
    for (const item of items) {
      order += 1;
      nodes.push({
        id: `pdf_outline_${order}`,
        title: String(item.title || `第 ${order} 项`),
        page: await resolveOutlinePage(pdfDocument, item.dest),
        level,
      });
      if (item.items?.length) {
        await visit(item.items, level + 1);
      }
    }
  }

  await visit(outline as PdfOutlineRawNode[], 1);
  return nodes;
}

function getOpenSourceViewer(host: HTMLElement | null) {
  const pdfViewer = host?.querySelector('.pdfViewer') as HTMLElement | null;
  const container = pdfViewer?.parentElement as HTMLElement | null;
  return { pdfViewer, container };
}

function clearFieldOverlays(pdfViewer: HTMLElement | null) {
  pdfViewer?.querySelectorAll('.procurement-field-overlay-layer').forEach((layer) => layer.remove());
}

function clearPageTaskOverlays(pdfViewer: HTMLElement | null) {
  pdfViewer?.querySelectorAll('.procurement-page-task-overlay, .procurement-page-task-fill-overlay').forEach((overlay) => overlay.remove());
}

function renderFieldOverlays(
  host: HTMLElement | null,
  fields: ProcurementTemplateField[],
  locations: Record<string, TemplatePdfFieldLocation>,
  selectedFieldId: string,
  onSelectedFieldChange: (fieldId: string) => void,
) {
  const { pdfViewer } = getOpenSourceViewer(host);
  if (!pdfViewer) return false;
  clearFieldOverlays(pdfViewer);

  fields.forEach((field) => {
    const location = locations[field.id];
    if (!location?.found || !location.rect) return;
    const page = pdfViewer.querySelector(`[data-page-number="${location.page}"]`) as HTMLElement | null;
    if (!page) return;

    if (getComputedStyle(page).position === 'static') {
      page.style.position = 'relative';
    }

    const layer = page.querySelector('.procurement-field-overlay-layer') || document.createElement('div');
    layer.className = 'procurement-field-overlay-layer';
    if (!layer.parentElement) {
      page.appendChild(layer);
    }

    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = `procurement-field-overlay${field.id === selectedFieldId ? ' is-active' : ''}`;
    marker.title = field.label;
    marker.setAttribute('aria-label', field.label);
    marker.style.left = `${location.rect.left * 100}%`;
    marker.style.top = `${location.rect.top * 100}%`;
    marker.style.width = `${location.rect.width * 100}%`;
    marker.style.height = `${Math.max(location.rect.height * 100, 1.2)}%`;
    marker.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSelectedFieldChange(field.id);
    });
    layer.appendChild(marker);
  });

  return true;
}

function renderPageTaskAnchorOverlays(
  host: HTMLElement | null,
  anchors: TemplatePdfPageTaskAnchorTarget[],
  locations: Record<string, TemplatePdfFieldLocation>,
  selectedAnchorId: string,
  fillValues: Record<string, TemplatePdfPageTaskFillTarget | undefined> = {},
) {
  const { pdfViewer } = getOpenSourceViewer(host);
  if (!pdfViewer) return false;
  clearPageTaskOverlays(pdfViewer);

  anchors.forEach((anchor) => {
    const location = locations[anchor.id];
    if (!location?.found || !location.rect) return;
    const page = pdfViewer.querySelector(`[data-page-number="${location.page}"]`) as HTMLElement | null;
    if (!page) return;

    if (getComputedStyle(page).position === 'static') {
      page.style.position = 'relative';
    }

    const layer = page.querySelector('.procurement-field-overlay-layer') || document.createElement('div');
    layer.className = 'procurement-field-overlay-layer';
    if (!layer.parentElement) {
      page.appendChild(layer);
    }

    const marker = document.createElement('span');
    marker.className = `procurement-page-task-overlay${anchor.id === selectedAnchorId ? ' is-active' : ''}`;
    marker.title = anchor.label;
    marker.style.left = `${location.rect.left * 100}%`;
    marker.style.top = `${location.rect.top * 100}%`;
    marker.style.width = `${location.rect.width * 100}%`;
    marker.style.height = `${Math.max(location.rect.height * 100, 1.2)}%`;
    layer.appendChild(marker);

    const fillValue = fillValues[anchor.taskKey];
    if (!fillValue?.value) return;
    const fillMarker = document.createElement('span');
    fillMarker.className = `procurement-page-task-fill-overlay is-${fillValue.status || 'filled'}${anchor.id === selectedAnchorId ? ' is-active' : ''}`;
    fillMarker.title = `${anchor.label}：${fillValue.value}`;
    fillMarker.textContent = fillValue.value;
    const labelRight = (location.rect.left + location.rect.width) * 100;
    const inlineLeft = Math.min(82, labelRight + 1.8);
    const hasInlineRoom = inlineLeft < 82;
    fillMarker.style.left = `${hasInlineRoom ? inlineLeft : location.rect.left * 100}%`;
    fillMarker.style.top = `${hasInlineRoom ? location.rect.top * 100 : Math.min(96, (location.rect.top + location.rect.height) * 100 + 0.4)}%`;
    fillMarker.style.maxWidth = `${hasInlineRoom ? Math.max(12, 96 - inlineLeft) : 42}%`;
    layer.appendChild(fillMarker);
  });

  return true;
}

function getVisiblePageNumber(pdfViewer: HTMLElement, container: HTMLElement) {
  const anchor = container.scrollTop + 32;
  let nextPage = 1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  pdfViewer.querySelectorAll('.page').forEach((page) => {
    const pageElement = page as HTMLElement;
    if (pageElement.offsetTop <= anchor && pageElement.offsetTop + pageElement.clientHeight >= anchor) {
      nextPage = Number(pageElement.dataset.pageNumber || nextPage);
      nearestDistance = 0;
      return;
    }
    if (nearestDistance === 0) return;
    const distance = Math.abs(pageElement.offsetTop - anchor);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nextPage = Number(pageElement.dataset.pageNumber || nextPage);
    }
  });
  return nextPage;
}

function OpenSourcePdfHighlighterBody({
  pdfDocument,
  hostRef,
  fields,
  locations,
  pageTaskAnchors,
  pageTaskAnchorLocations,
  pageTaskFillValues,
  detectedHighlightCount,
  selectedFieldId,
  selectedPageTaskAnchorId,
  onSelectedFieldChange,
  onLocationsChange,
  onPageTaskAnchorLocationsChange,
  onPageChange,
}: OpenSourcePdfHighlighterBodyProps) {
  const [outline, setOutline] = useState<PdfOutlineNode[]>([]);
  const [outlineStatus, setOutlineStatus] = useState('正在读取 PDF 大纲...');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewerMounted, setViewerMounted] = useState(false);
  const pageInputRef = useRef<HTMLInputElement | null>(null);
  const jumpButtonRef = useRef<HTMLButtonElement | null>(null);
  const currentPageRef = useRef(1);
  const scrollFrameRef = useRef(0);
  const pageCount = pdfDocument.numPages || 1;

  useEffect(() => {
    const timer = window.setTimeout(() => setViewerMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, [pdfDocument]);

  const scrollToPage = useCallback((page: number) => {
    const targetPage = Math.max(1, Math.min(pageCount, Number(page) || 1));
    const { pdfViewer, container } = getOpenSourceViewer(hostRef.current);
    const pageElement = pdfViewer?.querySelector(`[data-page-number="${targetPage}"]`) as HTMLElement | null;
    if (!container || !pageElement) return;
    const top = Math.max(0, pageElement.offsetTop - 20);
    container.scrollTo({ top, behavior: 'auto' });
    container.scrollTop = top;
    currentPageRef.current = targetPage;
    setCurrentPage(targetPage);
    if (pageInputRef.current) {
      pageInputRef.current.value = String(targetPage);
    }
    onPageChange(targetPage);
  }, [hostRef, onPageChange, pageCount]);

  const jumpToInputPage = useCallback(() => {
    scrollToPage(Number(pageInputRef.current?.value || 1));
  }, [scrollToPage]);

  const updateCurrentPageFromScroll = useCallback(() => {
    const { pdfViewer, container } = getOpenSourceViewer(hostRef.current);
    if (!pdfViewer || !container) return;
    const nextPage = getVisiblePageNumber(pdfViewer, container);
    if (currentPageRef.current !== nextPage) {
      currentPageRef.current = nextPage;
      setCurrentPage(nextPage);
      onPageChange(nextPage);
    }
  }, [hostRef, onPageChange]);

  useEffect(() => {
    let cancelled = false;
    onLocationsChange({});
    void locateFields(pdfDocument, fields).then((nextLocations) => {
      if (!cancelled) {
        onLocationsChange(nextLocations);
      }
    }).catch(() => {
      if (!cancelled) {
        onLocationsChange(Object.fromEntries(fields.map((field) => [field.id, {
          fieldId: field.id,
          page: 0,
          rect: null,
          found: false,
          matchText: '',
        }])));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fields, onLocationsChange, pdfDocument]);

  useEffect(() => {
    let cancelled = false;
    onPageTaskAnchorLocationsChange({});
    void locatePageTaskAnchors(pdfDocument, pageTaskAnchors).then((nextLocations) => {
      if (!cancelled) {
        onPageTaskAnchorLocationsChange(nextLocations);
      }
    }).catch(() => {
      if (!cancelled) {
        onPageTaskAnchorLocationsChange(Object.fromEntries(pageTaskAnchors.map((anchor) => [anchor.id, {
          fieldId: anchor.id,
          page: anchor.page,
          rect: null,
          found: false,
          matchText: '',
        }])));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [onPageTaskAnchorLocationsChange, pageTaskAnchors, pdfDocument]);

  useEffect(() => {
    let cancelled = false;
    void flattenPdfOutline(pdfDocument).then((nodes) => {
      if (cancelled) return;
      setOutline(nodes);
      setOutlineStatus(nodes.length ? '' : '当前 PDF 没有内置大纲');
    }).catch((error) => {
      if (!cancelled) {
        setOutlineStatus(error instanceof Error ? error.message : 'PDF 大纲读取失败');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pdfDocument]);

  useEffect(() => {
    if (pageInputRef.current) {
      pageInputRef.current.value = String(currentPage);
    }
  }, [currentPage]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const timers = [400, 1200, 2200].map((delay) => window.setTimeout(() => {
      const { pdfViewer, container } = getOpenSourceViewer(hostRef.current);
      if (!pdfViewer || !container || cleanup) return;
      const handleScroll = () => {
        if (scrollFrameRef.current) return;
        scrollFrameRef.current = window.requestAnimationFrame(() => {
          scrollFrameRef.current = 0;
          updateCurrentPageFromScroll();
        });
      };
      updateCurrentPageFromScroll();
      container.addEventListener('scroll', handleScroll, { passive: true });
      cleanup = () => {
        container.removeEventListener('scroll', handleScroll);
        if (scrollFrameRef.current) {
          window.cancelAnimationFrame(scrollFrameRef.current);
          scrollFrameRef.current = 0;
        }
      };
    }, delay));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      cleanup?.();
    };
  }, [hostRef, pdfDocument, updateCurrentPageFromScroll]);

  useEffect(() => {
    const timers = [100, 500, 1200, 2200].map((delay) => window.setTimeout(() => {
      renderFieldOverlays(hostRef.current, fields, locations, selectedFieldId, onSelectedFieldChange);
      renderPageTaskAnchorOverlays(hostRef.current, pageTaskAnchors, pageTaskAnchorLocations, selectedPageTaskAnchorId, pageTaskFillValues);
    }, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [fields, hostRef, locations, onSelectedFieldChange, pageTaskAnchorLocations, pageTaskAnchors, pageTaskFillValues, pdfDocument, selectedFieldId, selectedPageTaskAnchorId]);

  useEffect(() => {
    const selectedLocation = selectedFieldId ? locations[selectedFieldId] : null;
    if (!selectedLocation?.found) return;
    setCurrentPage(selectedLocation.page);
    if (pageInputRef.current) {
      pageInputRef.current.value = String(selectedLocation.page);
    }
  }, [locations, selectedFieldId]);

  useEffect(() => {
    const selectedLocation = selectedPageTaskAnchorId ? pageTaskAnchorLocations[selectedPageTaskAnchorId] : null;
    if (!selectedLocation?.found) return;
    setCurrentPage(selectedLocation.page);
    if (pageInputRef.current) {
      pageInputRef.current.value = String(selectedLocation.page);
    }
  }, [pageTaskAnchorLocations, selectedPageTaskAnchorId]);

  return (
    <div className="procurement-open-source-shell">
      <aside className="procurement-open-source-outline">
        <div className="procurement-open-source-outline-head">
          <strong>PDF 大纲</strong>
          <span>{outline.length ? `${outline.length} 项` : '目录'}</span>
        </div>
        <div className="procurement-open-source-outline-list">
          {outline.length ? outline.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.page === currentPage ? 'is-active' : ''}
              style={{ paddingLeft: 10 + item.level * 12 }}
              disabled={!item.page}
              onClick={() => item.page && scrollToPage(item.page)}
            >
              <span>{item.title}</span>
              {item.page && <small>{item.page}</small>}
            </button>
          )) : (
            <div className="procurement-empty-mini">{outlineStatus}</div>
          )}
        </div>
      </aside>

      <section className="procurement-open-source-main">
        <div className="procurement-open-source-toolbar">
          <button type="button" onClick={() => scrollToPage(currentPage - 1)} disabled={currentPage <= 1}>上一页</button>
          <div className="procurement-open-source-page-jump">
            <input
              ref={pageInputRef}
              name="page"
              defaultValue="1"
              inputMode="numeric"
              aria-label="页码"
              onInput={(event) => {
                const value = event.currentTarget.value.replace(/[^\d]/g, '');
                event.currentTarget.value = value;
                if (value) {
                  scrollToPage(Number(value));
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                jumpToInputPage();
              }}
            />
            <span>/ {pageCount}</span>
            <button ref={jumpButtonRef} type="button" onClick={jumpToInputPage}>跳转</button>
          </div>
          <button type="button" onClick={() => scrollToPage(currentPage + 1)} disabled={currentPage >= pageCount}>下一页</button>
          <span>{detectedHighlightCount} 个字段高亮 · {Object.values(pageTaskAnchorLocations).filter((location) => location.found).length} 个页面任务锚点</span>
        </div>
        <div className="procurement-open-source-viewer">
          {viewerMounted ? (
            <PdfHighlighter<IHighlight>
              pdfDocument={pdfDocument}
              highlights={emptyPdfHighlights}
              pdfScaleValue="page-width"
              enableAreaSelection={() => false}
              onScrollChange={noopPdfHandler}
              scrollRef={noopPdfHandler}
              onSelectionFinished={noopSelectionFinished}
              highlightTransform={noopSelectionFinished}
            />
          ) : (
            <div className="procurement-empty-mini">正在初始化开源 PDF 阅读器...</div>
          )}
        </div>
      </section>
    </div>
  );
}

export function OpenSourcePdfHighlighterPreview({
  pdfUrl,
  templateId,
  fields,
  selectedFieldId,
  onSelectedFieldChange,
  onFieldLocationsChange,
  onPageChange,
  pageTaskAnchors = emptyPageTaskAnchors,
  selectedPageTaskAnchorId = '',
  onPageTaskAnchorLocationsChange,
  pageTaskFillValues = emptyPageTaskFillValues,
}: OpenSourcePdfHighlighterPreviewProps) {
  const [loadableUrl, setLoadableUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [locations, setLocations] = useState<Record<string, TemplatePdfFieldLocation>>({});
  const [pageTaskAnchorLocations, setPageTaskAnchorLocations] = useState<Record<string, TemplatePdfFieldLocation>>({});
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleLocationsChange = useCallback((nextLocations: Record<string, TemplatePdfFieldLocation>) => {
    setLocations(nextLocations);
    onFieldLocationsChange(nextLocations);
  }, [onFieldLocationsChange]);
  const handlePageTaskAnchorLocationsChange = useCallback((nextLocations: Record<string, TemplatePdfFieldLocation>) => {
    setPageTaskAnchorLocations(nextLocations);
    onPageTaskAnchorLocationsChange?.(nextLocations);
  }, [onPageTaskAnchorLocationsChange]);

  const detectedHighlightCount = useMemo(() => fields
    .filter((field) => locations[field.id]?.found && locations[field.id]?.rect).length, [fields, locations]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';

    async function load() {
      setErrorMessage('');
      setLoadableUrl('');
      try {
        const nextUrl = await createLoadablePdfUrl(pdfUrl, templateId);
        if (cancelled) {
          if (nextUrl.startsWith('blob:')) URL.revokeObjectURL(nextUrl);
          return;
        }
        objectUrl = nextUrl.startsWith('blob:') ? nextUrl : '';
        setLoadableUrl(nextUrl);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : '开源 PDF 阅读器加载失败');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pdfUrl, templateId]);

  useEffect(() => {
    setLocations({});
    onFieldLocationsChange({});
    setPageTaskAnchorLocations({});
    onPageTaskAnchorLocationsChange?.({});
  }, [onFieldLocationsChange, pdfUrl, templateId]);

  useEffect(() => {
    const selectedLocation = selectedFieldId ? locations[selectedFieldId] : null;
    if (!selectedLocation?.found || !selectedLocation.rect) return undefined;
    onPageChange(selectedLocation.page);

    const scrollToLocation = () => {
      const { pdfViewer, container } = getOpenSourceViewer(hostRef.current);
      const page = pdfViewer?.querySelector(`[data-page-number="${selectedLocation.page}"]`) as HTMLElement | null;
      if (!container || !page) return;
      const top = Math.max(0, page.offsetTop + selectedLocation.rect!.top * page.clientHeight - 72);
      container.scrollTo({ top, behavior: 'auto' });
      container.scrollTop = top;
    };

    const timers = [80, 500, 1200].map((delay) => window.setTimeout(() => {
      scrollToLocation();
    }, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [locations, onPageChange, selectedFieldId]);

  useEffect(() => {
    const selectedLocation = selectedPageTaskAnchorId ? pageTaskAnchorLocations[selectedPageTaskAnchorId] : null;
    if (!selectedLocation?.found || !selectedLocation.rect) return undefined;
    onPageChange(selectedLocation.page);

    const scrollToLocation = () => {
      const { pdfViewer, container } = getOpenSourceViewer(hostRef.current);
      const page = pdfViewer?.querySelector(`[data-page-number="${selectedLocation.page}"]`) as HTMLElement | null;
      if (!container || !page) return;
      const top = Math.max(0, page.offsetTop + selectedLocation.rect!.top * page.clientHeight - 72);
      container.scrollTo({ top, behavior: 'auto' });
      container.scrollTop = top;
      renderPageTaskAnchorOverlays(hostRef.current, pageTaskAnchors, pageTaskAnchorLocations, selectedPageTaskAnchorId, pageTaskFillValues);
    };

    const timers = [80, 500, 1200].map((delay) => window.setTimeout(() => {
      scrollToLocation();
    }, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [onPageChange, pageTaskAnchorLocations, pageTaskAnchors, pageTaskFillValues, selectedPageTaskAnchorId]);

  if (errorMessage) {
    return <div className="procurement-empty-mini">{errorMessage}</div>;
  }

  if (!loadableUrl) {
    return <div className="procurement-empty-mini">正在加载开源 PDF 阅读器...</div>;
  }

  return (
    <div ref={hostRef} className="procurement-open-source-pdf">
      <PdfLoader
        url={loadableUrl}
        workerSrc={pdfHighlighterWorkerUrl}
        cMapUrl="/pdfjs-cmaps-4.4.168/"
        cMapPacked
        beforeLoad={<div className="procurement-empty-mini">正在解析 PDF...</div>}
        errorMessage={<div className="procurement-empty-mini">PDF 加载失败</div>}
        onError={(error) => setErrorMessage(error.message)}
      >
        {(pdfDocument) => (
          <OpenSourcePdfHighlighterBody
            pdfDocument={pdfDocument}
            hostRef={hostRef}
            fields={fields}
            locations={locations}
            pageTaskAnchors={pageTaskAnchors}
            pageTaskAnchorLocations={pageTaskAnchorLocations}
            pageTaskFillValues={pageTaskFillValues}
            detectedHighlightCount={detectedHighlightCount}
            selectedFieldId={selectedFieldId}
            selectedPageTaskAnchorId={selectedPageTaskAnchorId}
            onSelectedFieldChange={onSelectedFieldChange}
            onLocationsChange={handleLocationsChange}
            onPageTaskAnchorLocationsChange={handlePageTaskAnchorLocationsChange}
            onPageChange={onPageChange}
          />
        )}
      </PdfLoader>
    </div>
  );
}
