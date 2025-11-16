// Viewport tracking with Intersection Observer for automatic market overlay

import { findAllImages, extractImageContext, isInViewport } from './image-detector';
import type { KalshiMarket } from './kalshi-api';
import { getMarketUrl, formatPrice, formatVolume, formatCloseTime } from './kalshi-api';

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
  private maxConcurrent = 8; // Max concurrent API calls (increased for speed)
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
        rootMargin: '100px', // Start loading 100px before entering viewport
        threshold: 0.5 // 50% visible
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
    this.trackedImages.forEach(tracked => {
      if (tracked.overlay) {
        tracked.overlay.remove();
      }
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
   * Process an image: extract context, get keywords, show overlay
   */
  private async processImage(img: HTMLImageElement, tracked: TrackedImage) {
    try {
      // Check if image is still relevant (not scrolled past)
      if (!this.isStillRelevant(img, tracked)) {
        console.log('[VIEWPORT-TRACKER] ⏭️ Skipping - user scrolled past');
        tracked.processed = true; // Mark as processed to avoid retrying
        return;
      }

      // Extract context
      const imageContext = extractImageContext(img);

      // Log context quality
      const contextScore = [
        imageContext.context.alt,
        imageContext.context.caption,
        imageContext.context.headline,
        imageContext.context.nearbyText
      ].filter(c => c && c.length > 0).length;

      console.log(`[VIEWPORT-TRACKER] 📋 Context: ${contextScore}/4 fields populated`);

      // Convert to data URL
      const imageDataUrl = await this.imageToDataURL(img);
      const isDataUrl = imageDataUrl.startsWith('data:');
      console.log(`[VIEWPORT-TRACKER] 🖼️ Image type: ${isDataUrl ? 'data URL' : 'http URL'}`);

      // Extract keywords via background script
      const response = await chrome.runtime.sendMessage({
        type: 'EXTRACT_KEYWORDS_WITH_CONTEXT',
        imageDataUrl: imageDataUrl,
        context: {
          alt: imageContext.context.alt,
          caption: imageContext.context.caption,
          headline: imageContext.context.headline,
          nearbyText: imageContext.context.nearbyText
        }
      });

      if (response.success && response.keywords.length > 0) {
        console.log(`[VIEWPORT-TRACKER] ✅ Keywords: ${response.keywords.join(', ')}`);

        // Check if we have a market
        if (response.market) {
          console.log(`[VIEWPORT-TRACKER] 🎰 Market: ${response.market.title}`);

          // Create and display betting card overlay
          const overlay = this.createMarketCard(img, response.market);
          document.body.appendChild(overlay);

          // Update tracked data
          tracked.processed = true;
          tracked.keywords = response.keywords;
          tracked.market = response.market;
          tracked.overlay = overlay;
        } else {
          console.log(`[VIEWPORT-TRACKER] ⚠️ No market found for keywords`);
          tracked.processed = true; // Mark as processed, don't show overlay
        }
      } else {
        console.log(`[VIEWPORT-TRACKER] ⚠️ No keywords extracted: ${response.error || 'Unknown reason'}`);
        tracked.processed = true; // Mark as processed to avoid retrying
      }

    } catch (error) {
      console.error('[VIEWPORT-TRACKER] ❌ Failed to process image:', error);

      // Log detailed error info
      if (error instanceof Error) {
        console.error('[VIEWPORT-TRACKER] ❌ Error name:', error.name);
        console.error('[VIEWPORT-TRACKER] ❌ Error message:', error.message);
        console.error('[VIEWPORT-TRACKER] ❌ Error stack:', error.stack);
      } else {
        console.error('[VIEWPORT-TRACKER] ❌ Error type:', typeof error);
        console.error('[VIEWPORT-TRACKER] ❌ Error value:', error);
      }

      tracked.processed = true; // Mark as processed to avoid infinite retries
    }
  }

  /**
   * Create betting market card overlay
   */
  private createMarketCard(img: HTMLImageElement, market: KalshiMarket): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = 'hg-market-card';

    // Position at top-left of image (absolute positioning on page)
    const bounds = img.getBoundingClientRect();
    overlay.style.top = `${window.scrollY + bounds.top + 12}px`;
    overlay.style.left = `${window.scrollX + bounds.left + 12}px`;

    // Build card content
    overlay.innerHTML = `
      <div class="hg-market-title">${this.truncateText(market.title, 80)}</div>
      <div class="hg-market-odds">
        <div class="hg-odd hg-odd-yes">
          <span class="hg-odd-label">YES</span>
          <span class="hg-odd-price">${formatPrice(market.yes_price)}</span>
        </div>
        <div class="hg-odd hg-odd-no">
          <span class="hg-odd-label">NO</span>
          <span class="hg-odd-price">${formatPrice(market.no_price)}</span>
        </div>
      </div>
      <div class="hg-market-meta">
        <span class="hg-meta-volume">${formatVolume(market.volume)}</span>
        <span class="hg-meta-divider">•</span>
        <span class="hg-meta-close">${formatCloseTime(market.close_time)}</span>
      </div>
      <div class="hg-market-cta">
        Bet Now →
      </div>
    `;

    // Make entire card clickable
    overlay.style.cursor = 'pointer';
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(getMarketUrl(market.ticker), '_blank');
    });

    return overlay;
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
   * Inject global betting card styles
   */
  private injectStyles() {
    if (document.getElementById('hg-betting-styles')) {
      return;
    }

    const styleSheet = document.createElement('style');
    styleSheet.id = 'hg-betting-styles';
    styleSheet.textContent = `
      .hg-market-card {
        position: absolute;
        z-index: 999999;
        pointer-events: auto;
        width: 300px;
        background: rgba(0, 0, 0, 0.92);
        backdrop-filter: blur(16px);
        border: 2px solid rgba(255, 20, 147, 0.6);
        border-radius: 16px;
        padding: 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        box-shadow: 0 0 30px rgba(255, 20, 147, 0.4),
                    0 8px 32px rgba(0, 0, 0, 0.6);
        animation: hgCardSlideIn 0.4s ease forwards;
        opacity: 0;
        transition: all 0.2s ease;
      }

      .hg-market-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 0 40px rgba(255, 20, 147, 0.6),
                    0 12px 48px rgba(0, 0, 0, 0.8);
        border-color: rgba(255, 20, 147, 0.9);
      }

      @keyframes hgCardSlideIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .hg-market-title {
        color: #ffffff;
        font-size: 15px;
        font-weight: 600;
        line-height: 1.4;
        margin-bottom: 12px;
      }

      .hg-market-odds {
        display: flex;
        gap: 10px;
        margin-bottom: 12px;
      }

      .hg-odd {
        flex: 1;
        padding: 10px;
        border-radius: 10px;
        text-align: center;
        transition: all 0.2s ease;
      }

      .hg-odd-yes {
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.05) 100%);
        border: 2px solid rgba(34, 197, 94, 0.4);
      }

      .hg-odd-yes:hover {
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.25) 0%, rgba(34, 197, 94, 0.15) 100%);
        border-color: rgba(34, 197, 94, 0.6);
      }

      .hg-odd-no {
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.05) 100%);
        border: 2px solid rgba(239, 68, 68, 0.4);
      }

      .hg-odd-no:hover {
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(239, 68, 68, 0.15) 100%);
        border-color: rgba(239, 68, 68, 0.6);
      }

      .hg-odd-label {
        display: block;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
        opacity: 0.8;
      }

      .hg-odd-yes .hg-odd-label {
        color: #22c55e;
      }

      .hg-odd-no .hg-odd-label {
        color: #ef4444;
      }

      .hg-odd-price {
        display: block;
        font-size: 20px;
        font-weight: 700;
      }

      .hg-odd-yes .hg-odd-price {
        color: #22c55e;
      }

      .hg-odd-no .hg-odd-price {
        color: #ef4444;
      }

      .hg-market-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
        margin-bottom: 12px;
      }

      .hg-meta-volume {
        font-weight: 600;
        color: rgba(255, 20, 147, 0.9);
      }

      .hg-meta-divider {
        opacity: 0.4;
      }

      .hg-market-cta {
        padding: 10px;
        background: linear-gradient(135deg, rgba(255, 20, 147, 0.9) 0%, rgba(255, 20, 147, 0.7) 100%);
        color: white;
        text-align: center;
        border-radius: 8px;
        font-weight: 700;
        font-size: 14px;
        letter-spacing: 0.5px;
        transition: all 0.2s ease;
      }

      .hg-market-card:hover .hg-market-cta {
        background: linear-gradient(135deg, rgba(255, 20, 147, 1) 0%, rgba(255, 20, 147, 0.9) 100%);
        box-shadow: 0 0 20px rgba(255, 20, 147, 0.6);
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

    // If last seen more than 5 seconds ago, probably scrolled past
    const timeSinceLastSeen = Date.now() - (tracked.lastSeen || 0);
    if (timeSinceLastSeen > 5000) {
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
