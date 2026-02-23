// Viewport tracking with Intersection Observer for automatic market overlay

import { findAllImages, extractImageContext, isInViewport } from './image-detector';
import type { KalshiMarket } from './kalshi-api';
import { getMarketUrl, formatPrice, formatVolume, formatCloseTime } from './kalshi-api';

// Size tier classification for responsive overlays
type ImageSizeTier = 'small' | 'medium' | 'large' | 'xlarge';

interface ImageSizeInfo {
  tier: ImageSizeTier;
  width: number;
  height: number;
  area: number;
  aspectRatio: number;
}

/**
 * Classify image into size tiers for responsive overlay design
 */
function classifyImageSize(img: HTMLImageElement): ImageSizeInfo {
  const bounds = img.getBoundingClientRect();
  const width = bounds.width;
  const height = bounds.height;
  const area = width * height;
  const minDimension = Math.min(width, height);
  const aspectRatio = width / height;

  let tier: ImageSizeTier;

  if (minDimension < 180 || area < 40000) {
    tier = 'small';      // Compact badge only
  } else if (minDimension < 300 || area < 120000) {
    tier = 'medium';     // Mini card
  } else if (minDimension < 450 || area < 300000) {
    tier = 'large';      // Standard card
  } else {
    tier = 'xlarge';     // Prominent card
  }

  return { tier, width, height, area, aspectRatio };
}

interface TrackedImage {
  element: HTMLImageElement;
  overlay?: HTMLDivElement;
  processed: boolean;
  keywords?: string[];
  market?: KalshiMarket | null;
  priority?: number; // Distance from viewport center (lower = higher priority)
  inViewport?: boolean; // Currently visible in viewport
  lastSeen?: number; // Timestamp when last seen
}

class ViewportTracker {
  private observer: IntersectionObserver | null = null;
  private trackedImages: Map<HTMLImageElement, TrackedImage> = new Map();
  private isEnabled = false;
  private processingQueue: Set<HTMLImageElement> = new Set();

  // Priority queue system
  private pendingQueue: Array<{ img: HTMLImageElement; priority: number }> = [];
  private maxConcurrent = 12; // Max concurrent API calls
  private currentProcessing = 0; // Currently active API calls

  constructor() {
    console.log('[VIEWPORT-TRACKER] 🎯 Initialized');
  }

  /**
   * Start tracking images in viewport
   */
  start() {
    if (this.isEnabled) {
      console.log('[VIEWPORT-TRACKER] ⚠️ Already enabled');
      return;
    }

    console.log('[VIEWPORT-TRACKER] 🚀 Starting viewport tracking...');
    this.isEnabled = true;

    // Create Intersection Observer
    this.observer = new IntersectionObserver(
      (entries) => this.handleIntersection(entries),
      {
        root: null, // viewport
        rootMargin: '400px', // Start loading well before entering viewport
        threshold: 0.15 // Start early - just 15% visible
      }
    );

    // Find and observe all images
    const images = findAllImages();
    console.log(`[VIEWPORT-TRACKER] 📸 Found ${images.length} images to track`);

    images.forEach(img => {
      this.trackedImages.set(img, {
        element: img,
        processed: false
      });
      this.observer!.observe(img);
    });

    // Inject styles if not present
    this.injectStyles();
  }

  /**
   * Stop tracking and remove all overlays
   */
  stop() {
    if (!this.isEnabled) {
      console.log('[VIEWPORT-TRACKER] ⚠️ Already disabled');
      return;
    }

    console.log('[VIEWPORT-TRACKER] 🛑 Stopping viewport tracking...');
    this.isEnabled = false;

    // Disconnect observer
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Remove all overlays
    document.querySelectorAll('.hg-market-card').forEach(el => el.remove());

    // Unwrap images from hg-img-wrap containers
    document.querySelectorAll('div.hg-img-wrap').forEach(wrapper => {
      // Only unwrap DIVs we created (not reused parents that just got the class)
      const parent = wrapper.parentNode;
      if (parent) {
        while (wrapper.firstChild) {
          parent.insertBefore(wrapper.firstChild, wrapper);
        }
        wrapper.remove();
      }
    });

    // Remove class from reused parents
    document.querySelectorAll('.hg-img-wrap').forEach(el => {
      el.classList.remove('hg-img-wrap');
    });

    // Restore overflow on ancestors we modified
    document.querySelectorAll('.hg-overflow-fix').forEach(el => {
      (el as HTMLElement).style.removeProperty('overflow');
      el.classList.remove('hg-overflow-fix');
    });

    // Clear tracking data
    this.trackedImages.clear();
    this.processingQueue.clear();
    this.pendingQueue = [];
    this.currentProcessing = 0;

    console.log('[VIEWPORT-TRACKER] ✅ Stopped and cleaned up');
  }

  /**
   * Handle intersection events
   */
  private handleIntersection(entries: IntersectionObserverEntry[]) {
    for (const entry of entries) {
      const img = entry.target as HTMLImageElement;
      const tracked = this.trackedImages.get(img);

      if (!tracked) continue;

      // Update viewport status
      tracked.inViewport = entry.isIntersecting;
      tracked.lastSeen = Date.now();

      // Image entered viewport and hasn't been processed yet
      if (entry.isIntersecting && !tracked.processed && !this.processingQueue.has(img)) {
        // Calculate priority (distance from viewport center)
        const priority = this.calculatePriority(img);
        tracked.priority = priority;

        console.log(`[VIEWPORT-TRACKER] 👁️ Image entered viewport (priority: ${priority.toFixed(0)}px)`);

        // Add to pending queue
        this.addToPriorityQueue(img, priority);

        // Start processing queue
        this.processQueue();
      }
    }
  }

  /**
   * Extract fast keywords from DOM context without LLM call.
   * Returns keywords if context is rich enough, or null to fall back to vision API.
   */
  private extractFastKeywords(context: { alt?: string; caption?: string; headline?: string; nearbyText?: string }): string[] | null {
    // Combine available text sources, prioritizing headline > caption > alt
    const sources = [context.headline, context.caption, context.alt].filter(Boolean);
    if (sources.length === 0) return null;

    const combinedText = sources.join(' ');
    // Need at least ~20 chars of meaningful text to extract good keywords
    if (combinedText.length < 20) return null;

    const stopWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'with', 'by', 'from', 'up', 'about', 'into', 'over', 'after', 'that', 'this', 'it', 'its', 'his', 'her', 'their', 'our', 'your', 'my', 'not', 'no', 'but', 'if', 'then', 'than', 'so', 'as', 'how', 'what', 'who', 'when', 'where', 'why', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'just', 'also', 'new', 'says', 'said', 'get', 'gets', 'got', 'here', 'there', 'very', 'much', 'many', 'like', 'make', 'made', 'take', 'took', 'come', 'came', 'want', 'know', 'think', 'look', 'give', 'use', 'find', 'tell', 'ask', 'work', 'seem', 'feel', 'try', 'leave', 'call', 'keep', 'let', 'begin', 'show', 'hear', 'play', 'run', 'move', 'live', 'believe', 'hold', 'bring', 'happen', 'write', 'provide', 'sit', 'stand', 'lose', 'pay', 'meet', 'include', 'continue', 'set', 'learn', 'change', 'lead', 'understand', 'watch', 'follow', 'stop', 'create', 'speak', 'read', 'allow', 'add', 'spend', 'grow', 'open', 'walk', 'win', 'offer', 'remember', 'love', 'consider', 'appear', 'buy', 'wait', 'serve', 'die', 'send', 'expect', 'build', 'stay', 'fall', 'cut', 'reach', 'kill', 'remain', 'suggest', 'raise', 'pass', 'sell', 'require', 'report', 'decide', 'pull']);

    const keywords: string[] = [];

    // Extract proper nouns and significant capitalized words (names, places, orgs)
    const words = combinedText.split(/[\s,.:;!?'"()\[\]{}|–—]+/).filter(w => w.length > 1);
    const properNouns = words.filter(w =>
      w.length > 2 &&
      w[0] === w[0].toUpperCase() &&
      w !== w.toUpperCase() && // Skip ALL-CAPS words like "LIVE", "BREAKING"
      !stopWords.has(w.toLowerCase())
    );

    // Deduplicate proper nouns
    const seen = new Set<string>();
    const uniqueProperNouns = properNouns.filter(w => {
      const lower = w.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });

    // Each proper noun becomes its own 1-word search term (great for "Trump", "Tesla", "Ukraine")
    for (const noun of uniqueProperNouns.slice(0, 4)) {
      keywords.push(noun);
    }

    // Also try 2-word bigrams from proper noun pairs (e.g. "government shutdown")
    for (let i = 0; i < words.length - 1; i++) {
      const w1 = words[i];
      const w2 = words[i + 1];
      if (
        w1.length > 3 && w2.length > 3 &&
        !stopWords.has(w1.toLowerCase()) && !stopWords.has(w2.toLowerCase())
      ) {
        const bigram = `${w1} ${w2}`;
        if (bigram.length <= 25 && !seen.has(bigram.toLowerCase())) {
          keywords.push(bigram);
          seen.add(bigram.toLowerCase());
          if (keywords.length >= 5) break;
        }
      }
    }

    return keywords.length > 0 ? keywords.slice(0, 5) : null;
  }

  /**
   * Process an image: extract context, get keywords, show overlay.
   * Uses fast-path (DOM text → Kalshi) when context is rich, falls back to vision API.
   */
  private async processImage(img: HTMLImageElement, tracked: TrackedImage) {
    try {
      // Check if image is still relevant (not scrolled past)
      if (!this.isStillRelevant(img, tracked)) {
        console.log('[VIEWPORT-TRACKER] ⏭️ Skipping - user scrolled past');
        tracked.processed = true;
        return;
      }

      // Extract DOM context
      const imageContext = extractImageContext(img);
      const context = {
        alt: imageContext.context.alt,
        caption: imageContext.context.caption,
        headline: imageContext.context.headline,
        nearbyText: imageContext.context.nearbyText
      };

      const contextScore = [context.alt, context.caption, context.headline, context.nearbyText]
        .filter(c => c && c.length > 0).length;
      console.log(`[VIEWPORT-TRACKER] 📋 Context: ${contextScore}/4 fields populated`);

      // FAST PATH: If we have rich text context, skip the expensive vision API
      const fastKeywords = this.extractFastKeywords(context);
      if (fastKeywords) {
        console.log(`[VIEWPORT-TRACKER] ⚡ FAST PATH: Using DOM keywords: ${fastKeywords.join(', ')}`);

        const response = await chrome.runtime.sendMessage({
          type: 'SEARCH_MARKETS_DIRECT',
          keywords: fastKeywords
        });

        if (response.success && response.market) {
          console.log(`[VIEWPORT-TRACKER] 🎰 Fast match: ${response.market.title}`);
          const overlay = this.createMarketCard(img, response.market);
          tracked.processed = true;
          tracked.keywords = fastKeywords;
          tracked.market = response.market;
          tracked.overlay = overlay;
          return;
        }

        // Fast path found no market - fall through to vision API
        console.log(`[VIEWPORT-TRACKER] ⚡ Fast path miss, falling back to vision API`);
      }

      // SLOW PATH: Vision API for keyword extraction + market search
      const imageDataUrl = await this.imageToDataURL(img);
      console.log(`[VIEWPORT-TRACKER] 🖼️ Using vision API (${imageDataUrl.startsWith('data:') ? 'data URL' : 'http URL'})`);

      const response = await chrome.runtime.sendMessage({
        type: 'EXTRACT_KEYWORDS_WITH_CONTEXT',
        imageDataUrl: imageDataUrl,
        context
      });

      if (response.success && response.keywords.length > 0) {
        console.log(`[VIEWPORT-TRACKER] ✅ Keywords: ${response.keywords.join(', ')}`);

        if (response.market) {
          console.log(`[VIEWPORT-TRACKER] 🎰 Market: ${response.market.title}`);
          const overlay = this.createMarketCard(img, response.market);
          tracked.processed = true;
          tracked.keywords = response.keywords;
          tracked.market = response.market;
          tracked.overlay = overlay;
        } else {
          console.log(`[VIEWPORT-TRACKER] ⚠️ No market found for keywords`);
          tracked.processed = true;
        }
      } else {
        console.log(`[VIEWPORT-TRACKER] ⚠️ No keywords extracted: ${response.error || 'Unknown reason'}`);
        tracked.processed = true;
      }

    } catch (error) {
      console.error('[VIEWPORT-TRACKER] ❌ Failed to process image:', error);
      if (error instanceof Error) {
        console.error('[VIEWPORT-TRACKER] ❌ Error name:', error.name);
        console.error('[VIEWPORT-TRACKER] ❌ Error message:', error.message);
        console.error('[VIEWPORT-TRACKER] ❌ Error stack:', error.stack);

        // Extension was reloaded but page wasn't refreshed — stop everything
        if (error.message.includes('Extension context invalidated') || error.message.includes('Extension context was invalidated')) {
          console.warn('[VIEWPORT-TRACKER] 🛑 Extension context invalidated — stopping tracker. Please refresh the page.');
          this.stop();
          return;
        }
      }
      tracked.processed = true;
    }
  }

  /**
   * Create betting market card overlay - sports betting style (bottom gradient)
   * Wraps image in a container and anchors overlay to the bottom
   */
  private createMarketCard(img: HTMLImageElement, market: KalshiMarket): HTMLDivElement {
    const sizeInfo = classifyImageSize(img);

    console.log(`[VIEWPORT-TRACKER] 📐 Image size: ${sizeInfo.tier} (${Math.round(sizeInfo.width)}x${Math.round(sizeInfo.height)})`);

    // Wrap image in a positioned container for overlay anchoring
    const wrapper = this.wrapImage(img);

    // Create overlay based on size tier
    const overlay = document.createElement('div');
    overlay.className = `hg-market-card hg-card-${sizeInfo.tier}`;
    overlay.dataset.tier = sizeInfo.tier;

    // Generate fake bettor count from volume for social proof
    const bettorCount = this.fakeBettorCount(market.volume);

    switch (sizeInfo.tier) {
      case 'small':
        overlay.innerHTML = this.buildSmallHTML(market, bettorCount);
        break;
      case 'medium':
        overlay.innerHTML = this.buildMediumHTML(market, bettorCount);
        break;
      case 'large':
        overlay.innerHTML = this.buildLargeHTML(market, bettorCount);
        break;
      case 'xlarge':
        overlay.innerHTML = this.buildXLargeHTML(market, bettorCount);
        break;
    }

    this.attachClickHandler(overlay, market);
    wrapper.appendChild(overlay);

    // Force opacity to 1 after animation delay as fallback
    // (handles cases where CSS animation doesn't fire due to conflicts)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        overlay.style.transform = 'translateY(0)';
      });
    });

    // Force ancestor overflow to visible so overlay isn't clipped
    // WSJ and other sites often have overflow:hidden on image containers
    this.forceOverflowVisible(wrapper);

    console.log(`[VIEWPORT-TRACKER] ✅ Overlay created and appended to wrapper. Wrapper in DOM: ${wrapper.isConnected}, Overlay in DOM: ${overlay.isConnected}`);
    return overlay;
  }

  /**
   * Wrap image in a positioned container for overlay anchoring.
   * Handles <picture> parents, flex/grid layouts, and already-positioned containers.
   */
  private wrapImage(img: HTMLImageElement): HTMLElement {
    // Check if already wrapped
    if (img.closest('.hg-img-wrap')) {
      return img.closest('.hg-img-wrap') as HTMLElement;
    }

    const parent = img.parentElement;
    if (!parent) {
      console.warn('[VIEWPORT-TRACKER] ⚠️ wrapImage: image has no parent, skipping');
      const fallback = document.createElement('div');
      fallback.className = 'hg-img-wrap';
      return fallback;
    }

    const parentTag = parent.tagName.toLowerCase();

    // If parent is <picture>, we need to wrap the <picture>, not the <img>
    // Moving <img> out of <picture> breaks the image entirely
    const targetElement = parentTag === 'picture' ? parent : img;
    const insertionParent = targetElement.parentElement;

    if (!insertionParent) {
      console.warn('[VIEWPORT-TRACKER] ⚠️ wrapImage: no insertion parent');
      const fallback = document.createElement('div');
      fallback.className = 'hg-img-wrap';
      return fallback;
    }

    const insertionParentStyle = window.getComputedStyle(insertionParent);

    // If the insertion parent is already positioned, reuse it as the wrapper
    if (insertionParentStyle.position === 'relative' || insertionParentStyle.position === 'absolute') {
      insertionParent.classList.add('hg-img-wrap');
      console.log(`[VIEWPORT-TRACKER] 🔧 wrapImage: reusing positioned parent <${insertionParent.tagName.toLowerCase()}>`);
      return insertionParent;
    }

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'hg-img-wrap';

    // Copy layout-relevant styles from the target to avoid breaking flex/grid layouts
    const targetStyle = window.getComputedStyle(targetElement);
    const display = targetStyle.display;

    // Preserve grid/flex participation
    if (insertionParentStyle.display.includes('flex') || insertionParentStyle.display.includes('grid')) {
      // Inherit flex/grid child properties
      wrapper.style.cssText = `
        flex: ${targetStyle.flex};
        align-self: ${targetStyle.alignSelf};
        grid-area: ${targetStyle.gridArea};
        order: ${targetStyle.order};
        width: ${targetStyle.width};
        max-width: ${targetStyle.maxWidth};
        min-width: ${targetStyle.minWidth};
      `;
    }

    // Set display to block (not inline-block which breaks layouts)
    wrapper.style.display = display === 'inline' ? 'inline-block' : 'block';

    // Wrap: insert wrapper before target, then move target into wrapper
    insertionParent.insertBefore(wrapper, targetElement);
    wrapper.appendChild(targetElement);

    console.log(`[VIEWPORT-TRACKER] 🔧 wrapImage: wrapped <${targetElement.tagName.toLowerCase()}> in div.hg-img-wrap`);
    return wrapper;
  }

  /**
   * Force overflow:visible on ancestor elements so the overlay isn't clipped.
   * Walks up a few levels from the wrapper to ensure visibility.
   */
  private forceOverflowVisible(wrapper: HTMLElement) {
    let el: HTMLElement | null = wrapper;
    let depth = 0;
    while (el && depth < 4) {
      const style = window.getComputedStyle(el);
      if (style.overflow === 'hidden' || style.overflowY === 'hidden' || style.overflowX === 'hidden') {
        el.style.setProperty('overflow', 'visible', 'important');
        el.classList.add('hg-overflow-fix');
      }
      el = el.parentElement;
      depth++;
    }
  }

  /**
   * Generate fake bettor count from volume for social proof
   */
  private fakeBettorCount(volume: number): string {
    const count = Math.max(Math.floor(volume / 800) + Math.floor(Math.random() * 200), 47);
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toLocaleString();
  }

  /**
   * SMALL: Bottom bar with pills only
   */
  private buildSmallHTML(market: KalshiMarket, bettors: string): string {
    return `
      <div class="hg-ticker">
        <span class="hg-live-dot"></span>
        <span>LIVE</span>
      </div>
      <div class="hg-pills">
        <div class="hg-pill hg-pill-yes">
          <span class="hg-pill-label">Yes</span>
          <span class="hg-pill-price">${formatPrice(market.yes_price)}</span>
        </div>
        <div class="hg-pill hg-pill-no">
          <span class="hg-pill-label">No</span>
          <span class="hg-pill-price">${formatPrice(market.no_price)}</span>
        </div>
      </div>
    `;
  }

  /**
   * MEDIUM: Ticker + title + pills
   */
  private buildMediumHTML(market: KalshiMarket, bettors: string): string {
    return `
      <div class="hg-ticker">
        <span class="hg-live-dot"></span>
        <span>LIVE</span>
      </div>
      <div class="hg-title">${this.truncateText(market.title, 60)}</div>
      <div class="hg-pills">
        <div class="hg-pill hg-pill-yes">
          <span class="hg-pill-label">Yes</span>
          <span class="hg-pill-price">${formatPrice(market.yes_price)}</span>
        </div>
        <div class="hg-pill hg-pill-no">
          <span class="hg-pill-label">No</span>
          <span class="hg-pill-price">${formatPrice(market.no_price)}</span>
        </div>
      </div>
    `;
  }

  /**
   * LARGE: Full gradient with ticker + title + pills + footer
   */
  private buildLargeHTML(market: KalshiMarket, bettors: string): string {
    return `
      <div class="hg-ticker">
        <span class="hg-live-dot"></span>
        <span>LIVE MARKET</span>
        <span class="hg-ticker-sep">&bull;</span>
        <span>${bettors} bettors</span>
      </div>
      <div class="hg-title">${this.truncateText(market.title, 80)}</div>
      <div class="hg-pills">
        <div class="hg-pill hg-pill-yes">
          <span class="hg-pill-label">Yes</span>
          <span class="hg-pill-price">${formatPrice(market.yes_price)}</span>
        </div>
        <div class="hg-pill hg-pill-no">
          <span class="hg-pill-label">No</span>
          <span class="hg-pill-price">${formatPrice(market.no_price)}</span>
        </div>
      </div>
      <div class="hg-footer">
        <span class="hg-trending">${formatVolume(market.volume)} &bull; ${formatCloseTime(market.close_time)}</span>
        <span class="hg-cta">Bet Now &rarr;</span>
      </div>
    `;
  }

  /**
   * XLARGE: Full prominent overlay
   */
  private buildXLargeHTML(market: KalshiMarket, bettors: string): string {
    return `
      <div class="hg-ticker">
        <span class="hg-live-dot"></span>
        <span>LIVE MARKET</span>
        <span class="hg-ticker-sep">&bull;</span>
        <span>${bettors} bettors</span>
      </div>
      <div class="hg-title">${this.truncateText(market.title, 100)}</div>
      <div class="hg-pills">
        <div class="hg-pill hg-pill-yes">
          <span class="hg-pill-label">Yes</span>
          <span class="hg-pill-price">${formatPrice(market.yes_price)}</span>
        </div>
        <div class="hg-pill hg-pill-no">
          <span class="hg-pill-label">No</span>
          <span class="hg-pill-price">${formatPrice(market.no_price)}</span>
        </div>
      </div>
      <div class="hg-footer">
        <span class="hg-trending">${formatVolume(market.volume)} &bull; ${formatCloseTime(market.close_time)}</span>
        <span class="hg-cta">Bet Now &rarr;</span>
      </div>
    `;
  }

  /**
   * Attach click handler to open market
   */
  private attachClickHandler(overlay: HTMLDivElement, market: KalshiMarket) {
    overlay.style.cursor = 'pointer';
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(getMarketUrl(market), '_blank');
    });
  }

  /**
   * Truncate text helper
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Convert image to data URL (with CORS fallback)
   */
  private async imageToDataURL(img: HTMLImageElement): Promise<string> {
    return new Promise((resolve) => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(img.src);
          return;
        }

        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        ctx.drawImage(img, 0, 0);

        try {
          const dataUrl = canvas.toDataURL('image/png');
          resolve(dataUrl);
        } catch (error) {
          // CORS error - use src as fallback
          resolve(img.src);
        }
      } catch (error) {
        resolve(img.src);
      }
    });
  }

  /**
   * Inject global betting card styles - responsive to size tiers
   */
  private injectStyles() {
    if (document.getElementById('hg-betting-styles')) {
      return;
    }

    const styleSheet = document.createElement('style');
    styleSheet.id = 'hg-betting-styles';
    styleSheet.textContent = `
      /* ========================================
         IMAGE WRAPPER
         ======================================== */
      .hg-img-wrap {
        position: relative !important;
        overflow: visible !important;
      }
      .hg-img-wrap > img,
      .hg-img-wrap > picture,
      .hg-img-wrap > picture > img {
        display: block;
        width: 100%;
      }

      /* ========================================
         BASE OVERLAY - Bottom gradient bleed
         ======================================== */
      .hg-market-card {
        position: absolute !important;
        z-index: 999999 !important;
        pointer-events: auto;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        background: linear-gradient(
          180deg,
          rgba(0,0,0,0) 0%,
          rgba(0,0,0,0.4) 25%,
          rgba(0,0,0,0.88) 50%,
          rgba(8,8,12,0.97) 100%
        ) !important;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif !important;
        color: #fff !important;
        cursor: pointer;
        animation: hgSlideUp 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        opacity: 0;
        box-sizing: border-box !important;
        border-bottom-left-radius: inherit;
        border-bottom-right-radius: inherit;
      }

      .hg-market-card * {
        box-sizing: border-box !important;
        font-family: inherit !important;
      }

      @keyframes hgSlideUp {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes hgLivePulse {
        0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(0,230,118,0.5); }
        50% { opacity: 0.4; box-shadow: 0 0 6px 2px rgba(0,230,118,0.3); }
      }

      /* ========================================
         LIVE TICKER
         ======================================== */
      .hg-ticker {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: rgba(255,255,255,0.08);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        padding: 3px 9px;
        border-radius: 3px;
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 1.8px;
        color: rgba(255,255,255,0.6);
        margin-bottom: 6px;
      }

      .hg-live-dot {
        width: 7px;
        height: 7px;
        background: #00e676;
        border-radius: 50%;
        display: inline-block;
        animation: hgLivePulse 1.2s ease-in-out infinite;
        flex-shrink: 0;
      }

      .hg-ticker-sep {
        opacity: 0.3;
        font-size: 7px;
      }

      /* ========================================
         TITLE
         ======================================== */
      .hg-title {
        font-size: 13px;
        font-weight: 700;
        line-height: 1.25;
        margin-bottom: 8px;
        color: #fff;
        max-width: 90%;
        text-shadow: 0 1px 3px rgba(0,0,0,0.4);
      }

      /* ========================================
         YES/NO PILL BUTTONS
         ======================================== */
      .hg-pills {
        display: flex;
        gap: 5px;
        margin-bottom: 8px;
      }

      .hg-pill {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-radius: 6px;
        font-weight: 700;
        font-size: 13px;
        border: 1.5px solid;
        transition: all 0.12s ease;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }

      .hg-pill:hover {
        transform: scale(1.04);
      }

      .hg-pill-yes {
        background: rgba(0,230,118,0.15);
        border-color: rgba(0,230,118,0.45);
        color: #00e676;
      }

      .hg-pill-yes:hover {
        background: rgba(0,230,118,0.28);
        border-color: rgba(0,230,118,0.8);
        box-shadow: 0 0 12px rgba(0,230,118,0.2);
      }

      .hg-pill-no {
        background: rgba(255,82,82,0.15);
        border-color: rgba(255,82,82,0.45);
        color: #ff5252;
      }

      .hg-pill-no:hover {
        background: rgba(255,82,82,0.28);
        border-color: rgba(255,82,82,0.8);
        box-shadow: 0 0 12px rgba(255,82,82,0.2);
      }

      .hg-pill-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        opacity: 0.7;
      }

      .hg-pill-price {
        font-size: 18px;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
      }

      /* ========================================
         FOOTER - Trending + CTA
         ======================================== */
      .hg-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 10px;
        color: rgba(255,255,255,0.35);
      }

      .hg-trending {
        color: #FFD54F;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 3px;
        font-size: 10px;
      }

      .hg-cta {
        background: linear-gradient(135deg, #00c853 0%, #00e676 100%);
        color: #000;
        padding: 6px 14px;
        border-radius: 4px;
        font-weight: 900;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1.2px;
        transition: all 0.12s ease;
        box-shadow: 0 2px 8px rgba(0,200,83,0.3);
      }

      .hg-market-card:hover .hg-cta {
        box-shadow: 0 2px 20px rgba(0,200,83,0.5);
        transform: scale(1.06);
        background: linear-gradient(135deg, #00e676 0%, #69f0ae 100%);
      }

      /* ========================================
         SIZE TIER ADJUSTMENTS
         ======================================== */

      /* SMALL - minimal bottom bar */
      .hg-card-small {
        padding: 24px 8px 8px 8px;
      }
      .hg-card-small .hg-ticker {
        font-size: 7px;
        padding: 2px 6px;
        margin-bottom: 4px;
        letter-spacing: 1.2px;
      }
      .hg-card-small .hg-live-dot {
        width: 5px;
        height: 5px;
      }
      .hg-card-small .hg-pills {
        gap: 3px;
        margin-bottom: 0;
      }
      .hg-card-small .hg-pill {
        padding: 5px 7px;
        font-size: 10px;
        border-radius: 4px;
      }
      .hg-card-small .hg-pill-label {
        font-size: 8px;
      }
      .hg-card-small .hg-pill-price {
        font-size: 13px;
      }

      /* MEDIUM */
      .hg-card-medium {
        padding: 32px 10px 10px 10px;
      }
      .hg-card-medium .hg-ticker {
        font-size: 8px;
        padding: 2px 7px;
        margin-bottom: 4px;
      }
      .hg-card-medium .hg-live-dot {
        width: 5px;
        height: 5px;
      }
      .hg-card-medium .hg-title {
        font-size: 11px;
        margin-bottom: 6px;
        max-width: 100%;
      }
      .hg-card-medium .hg-pills {
        gap: 4px;
        margin-bottom: 0;
      }
      .hg-card-medium .hg-pill {
        padding: 6px 9px;
        font-size: 11px;
        border-radius: 5px;
      }
      .hg-card-medium .hg-pill-label {
        font-size: 8px;
      }
      .hg-card-medium .hg-pill-price {
        font-size: 14px;
      }

      /* LARGE - full treatment */
      .hg-card-large {
        padding: 50px 14px 12px 14px;
      }
      .hg-card-large .hg-title {
        font-size: 13px;
      }

      /* XLARGE - prominent */
      .hg-card-xlarge {
        padding: 70px 18px 14px 18px;
      }
      .hg-card-xlarge .hg-title {
        font-size: 15px;
        margin-bottom: 10px;
      }
      .hg-card-xlarge .hg-pill {
        padding: 10px 14px;
      }
      .hg-card-xlarge .hg-pill-price {
        font-size: 22px;
      }
      .hg-card-xlarge .hg-footer {
        font-size: 11px;
      }
      .hg-card-xlarge .hg-cta {
        padding: 7px 18px;
        font-size: 12px;
      }
    `;
    document.head.appendChild(styleSheet);
  }

  /**
   * Calculate priority based on distance from viewport center
   * Lower value = higher priority (closer to center)
   */
  private calculatePriority(img: HTMLImageElement): number {
    const rect = img.getBoundingClientRect();
    const viewportCenterY = window.innerHeight / 2;
    const viewportCenterX = window.innerWidth / 2;

    const imgCenterY = rect.top + rect.height / 2;
    const imgCenterX = rect.left + rect.width / 2;

    // Euclidean distance from viewport center
    const distanceY = Math.abs(imgCenterY - viewportCenterY);
    const distanceX = Math.abs(imgCenterX - viewportCenterX);
    const distance = Math.sqrt(distanceY * distanceY + distanceX * distanceX);

    return distance;
  }

  /**
   * Add image to priority queue (sorted by priority)
   */
  private addToPriorityQueue(img: HTMLImageElement, priority: number) {
    // Remove if already in queue
    this.pendingQueue = this.pendingQueue.filter(item => item.img !== img);

    // Add with new priority
    this.pendingQueue.push({ img, priority });

    // Sort by priority (lower = higher priority)
    this.pendingQueue.sort((a, b) => a.priority - b.priority);

    console.log(`[VIEWPORT-TRACKER] 📋 Queue size: ${this.pendingQueue.length}, processing: ${this.currentProcessing}/${this.maxConcurrent}`);
  }

  /**
   * Process queue with rate limiting
   */
  private async processQueue() {
    // Don't exceed max concurrent
    if (this.currentProcessing >= this.maxConcurrent) {
      return;
    }

    // Get next image from queue
    const next = this.pendingQueue.shift();
    if (!next) {
      return;
    }

    const { img } = next;
    const tracked = this.trackedImages.get(img);
    if (!tracked || tracked.processed) {
      // Continue processing queue
      this.processQueue();
      return;
    }

    // Mark as processing
    this.processingQueue.add(img);
    this.currentProcessing++;

    console.log(`[VIEWPORT-TRACKER] 🔄 Processing (${this.currentProcessing}/${this.maxConcurrent} active)`);

    try {
      await this.processImage(img, tracked);
    } finally {
      // Clean up
      this.processingQueue.delete(img);
      this.currentProcessing--;

      // Process next in queue
      this.processQueue();
    }
  }

  /**
   * Check if image is still relevant (not scrolled too far past)
   */
  private isStillRelevant(img: HTMLImageElement, tracked: TrackedImage): boolean {
    // If still in viewport, definitely relevant
    if (tracked.inViewport) {
      return true;
    }

    // If last seen more than 10 seconds ago, probably scrolled past
    const timeSinceLastSeen = Date.now() - (tracked.lastSeen || 0);
    if (timeSinceLastSeen > 10000) {
      return false;
    }

    // Check if within reasonable distance of viewport
    const rect = img.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    // Allow images up to 2 viewports away (above or below)
    const maxDistance = viewportHeight * 2;
    const distanceAbove = -rect.bottom;
    const distanceBelow = rect.top - viewportHeight;

    if (distanceAbove > maxDistance || distanceBelow > maxDistance) {
      return false;
    }

    return true;
  }

  /**
   * Get status
   */
  isActive(): boolean {
    return this.isEnabled;
  }

  /**
   * Get stats
   */
  getStats() {
    const total = this.trackedImages.size;
    const processed = Array.from(this.trackedImages.values()).filter(t => t.processed).length;
    const withKeywords = Array.from(this.trackedImages.values()).filter(t => t.keywords && t.keywords.length > 0).length;

    return { total, processed, withKeywords };
  }
}

// Export singleton instance
export const viewportTracker = new ViewportTracker();
