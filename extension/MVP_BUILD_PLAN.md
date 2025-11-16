# MVP Build Plan - Incremental Development & Validation

## Philosophy

Build in small, testable increments. Validate each step works before moving forward. Start simple, add complexity gradually.

---

## MVP Goal

**Show a toast notification with LLM-extracted keywords based on mouse-proximate content.**

Start WITHOUT Sean's API - just prove the core UX works.

---

## Phase 0: Setup & Dependencies (1-2 hours)

### Goal
Get all dependencies installed and verify build works.

### Tasks

```bash
cd hypergamblification-repo

# Install new dependencies
npm install tesseract.js openai

# Verify build still works
npm run build
```

### Files to Update

**package.json** - Add dependencies:
```json
{
  "dependencies": {
    "kalshi-typescript": "^2.1.3",
    "openai": "^4.20.0",
    "tesseract.js": "^5.0.4",
    "fuse.js": "^7.0.0"
  }
}
```

### Validation

✅ `npm run build` completes without errors
✅ Extension loads in Chrome
✅ Console shows "[HYPERGAMBLIFICATION] Extension loaded"

---

## Phase 1: Mouse Position Tracking (2-3 hours)

### Goal
Track mouse position on the page and log coordinates.

### What to Build

**File: `src/content/mouse-tracker.ts`** (NEW)

```typescript
export class MouseTracker {
  private currentX: number = 0;
  private currentY: number = 0;
  private isTracking: boolean = false;

  start() {
    if (this.isTracking) return;

    this.isTracking = true;
    document.addEventListener('mousemove', this.handleMouseMove);
    console.log('[MOUSE] Tracking started');
  }

  stop() {
    this.isTracking = false;
    document.removeEventListener('mousemove', this.handleMouseMove);
    console.log('[MOUSE] Tracking stopped');
  }

  private handleMouseMove = (e: MouseEvent) => {
    this.currentX = e.clientX;
    this.currentY = e.clientY;
  };

  getPosition(): { x: number; y: number } {
    return { x: this.currentX, y: this.currentY };
  }
}

export const mouseTracker = new MouseTracker();
```

**Update: `src/content/content.ts`**

```typescript
import { mouseTracker } from './mouse-tracker';

console.log('[HYPERGAMBLIFICATION] Content script loaded');

// Start tracking mouse
mouseTracker.start();

// Test: Log position every 5 seconds
setInterval(() => {
  const pos = mouseTracker.getPosition();
  console.log('[MOUSE] Current position:', pos);
}, 5000);
```

### Testing

1. Build: `npm run build`
2. Reload extension in Chrome
3. Open any webpage
4. Move mouse around
5. Check console every 5 seconds

### Validation

✅ Console logs mouse position every 5 seconds
✅ Position updates as you move mouse
✅ No errors in console

**STOP HERE - Don't proceed until this works!**

---

## Phase 2: Region Screenshot (3-4 hours)

### Goal
Capture a 400x400px region around the mouse cursor.

### What to Build

**File: `src/lib/region-capture.ts`** (NEW)

```typescript
import { mouseTracker } from '../content/mouse-tracker';

export async function captureRegionAroundMouse(
  radius: number = 200
): Promise<string> {
  // Get full page screenshot
  const fullScreenshot = await captureFullScreen();

  // Get mouse position
  const { x, y } = mouseTracker.getPosition();

  // Crop to region around mouse
  const regionDataUrl = await cropImage(fullScreenshot, x, y, radius);

  return regionDataUrl;
}

async function captureFullScreen(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'CAPTURE_SCREENSHOT' },
      (response) => {
        if (response.success) {
          resolve(response.dataUrl);
        } else {
          reject(new Error(response.error));
        }
      }
    );
  });
}

async function cropImage(
  dataUrl: string,
  centerX: number,
  centerY: number,
  radius: number
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      const size = radius * 2;
      canvas.width = size;
      canvas.height = size;

      // Calculate crop coordinates
      const sx = Math.max(0, centerX - radius);
      const sy = Math.max(0, centerY - radius);
      const sw = Math.min(size, img.width - sx);
      const sh = Math.min(size, img.height - sy);

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      resolve(canvas.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
}
```

**Update: `src/background/background.ts`**

```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_SCREENSHOT') {
    chrome.tabs.captureVisibleTab(
      null,
      { format: 'png' },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, dataUrl });
        }
      }
    );
    return true; // Keep channel open
  }
});
```

**Update: `src/content/content.ts`**

```typescript
import { captureRegionAroundMouse } from '@/lib/region-capture';

// Test: Capture region when user presses Ctrl+Shift+K
document.addEventListener('keydown', async (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'K') {
    console.log('[CAPTURE] Capturing region around mouse...');

    try {
      const regionDataUrl = await captureRegionAroundMouse(200);
      console.log('[CAPTURE] Success! Data URL length:', regionDataUrl.length);

      // Test: Show in new window
      const win = window.open();
      win?.document.write(`<img src="${regionDataUrl}" />`);
    } catch (error) {
      console.error('[CAPTURE] Failed:', error);
    }
  }
});
```

### Testing

1. Build: `npm run build`
2. Reload extension
3. Open any webpage with text/images
4. Hover over something interesting
5. Press `Ctrl+Shift+K`
6. New window should pop up showing cropped region

### Validation

✅ New window shows ~400x400px region around cursor
✅ Region contains text/content near mouse
✅ Works on different websites
✅ No errors in console

**STOP HERE - Don't proceed until this works!**

---

## Phase 3: OCR on Region (2-3 hours)

### Goal
Extract text from the captured region using Tesseract.js.

### What to Build

**File: `src/lib/ocr.ts`** (NEW)

```typescript
import { createWorker, Worker } from 'tesseract.js';

let worker: Worker | null = null;

export async function initOCR(): Promise<void> {
  if (worker) return;

  console.log('[OCR] Initializing Tesseract worker...');
  worker = await createWorker('eng');
  console.log('[OCR] Worker ready!');
}

export async function extractText(imageDataUrl: string): Promise<string> {
  if (!worker) {
    await initOCR();
  }

  console.log('[OCR] Recognizing text...');
  const { data } = await worker!.recognize(imageDataUrl);

  console.log('[OCR] Confidence:', data.confidence);
  console.log('[OCR] Text extracted:', data.text);

  return data.text.trim();
}

export async function cleanup(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
    console.log('[OCR] Worker terminated');
  }
}
```

**Update: `src/content/content.ts`**

```typescript
import { captureRegionAroundMouse } from '@/lib/region-capture';
import { extractText, initOCR } from '@/lib/ocr';

// Initialize OCR on load
initOCR();

// Test: OCR region when user presses Ctrl+Shift+K
document.addEventListener('keydown', async (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'K') {
    console.log('[TEST] Starting region OCR...');

    try {
      // 1. Capture region
      const regionDataUrl = await captureRegionAroundMouse(200);
      console.log('[TEST] Region captured');

      // 2. OCR
      const text = await extractText(regionDataUrl);
      console.log('[TEST] ✅ OCR Result:', text);

      // Show in alert for easy reading
      alert(`OCR Extracted:\n\n${text}`);

    } catch (error) {
      console.error('[TEST] ❌ Failed:', error);
    }
  }
});
```

### Testing

1. Build: `npm run build`
2. Reload extension (important - Tesseract worker needs to load)
3. Open webpage with clear text (e.g., news article)
4. Hover over a paragraph
5. Press `Ctrl+Shift+K`
6. Wait 2-3 seconds
7. Alert should show extracted text

### Validation

✅ Alert shows text from near cursor
✅ Text is readable (>80% accurate)
✅ Works on different text sizes
✅ Takes <5 seconds to complete

**STOP HERE - Don't proceed until this works!**

---

## Phase 4: LLM Keyword Extraction (2-3 hours)

### Goal
Send OCR text to GPT-4o-mini to extract relevant keywords.

### What to Build

**File: `src/lib/llm-keywords.ts`** (NEW)

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Only for MVP testing
});

export async function extractKeywords(text: string): Promise<string> {
  console.log('[LLM] Extracting keywords from:', text.substring(0, 100));

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Extract 3-5 key topics/keywords from the text that would be relevant for prediction market search. Return ONLY the keywords, comma-separated.'
      },
      {
        role: 'user',
        content: text
      }
    ],
    temperature: 0.3,
    max_tokens: 50
  });

  const keywords = response.choices[0].message.content?.trim() || '';
  console.log('[LLM] Keywords:', keywords);

  return keywords;
}
```

**Update: `webpack.config.js`** - Add environment variables

```javascript
const webpack = require('webpack');

module.exports = {
  // ... existing config
  plugins: [
    new CopyPlugin({
      patterns: [{ from: 'public', to: '.' }],
    }),
    new webpack.DefinePlugin({
      'process.env.OPENAI_API_KEY': JSON.stringify(process.env.OPENAI_API_KEY)
    })
  ],
};
```

**Create: `.env`** (if not exists)

```bash
OPENAI_API_KEY=sk-proj-your-key-here
```

**Update: `src/content/content.ts`**

```typescript
import { captureRegionAroundMouse } from '@/lib/region-capture';
import { extractText, initOCR } from '@/lib/ocr';
import { extractKeywords } from '@/lib/llm-keywords';

// Initialize OCR on load
initOCR();

// Test: Full pipeline when user presses Ctrl+Shift+K
document.addEventListener('keydown', async (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'K') {
    console.log('[TEST] Starting full pipeline...');

    try {
      // 1. Capture region
      console.log('[TEST] Step 1: Capturing region...');
      const regionDataUrl = await captureRegionAroundMouse(200);

      // 2. OCR
      console.log('[TEST] Step 2: Running OCR...');
      const text = await extractText(regionDataUrl);
      console.log('[TEST] OCR text:', text);

      // 3. LLM keyword extraction
      console.log('[TEST] Step 3: Extracting keywords...');
      const keywords = await extractKeywords(text);
      console.log('[TEST] Keywords:', keywords);

      // Show result
      alert(`✅ Pipeline Complete!\n\nOCR Text:\n${text.substring(0, 200)}...\n\nKeywords:\n${keywords}`);

    } catch (error) {
      console.error('[TEST] ❌ Pipeline failed:', error);
      alert(`❌ Error: ${error.message}`);
    }
  }
});
```

### Testing

1. Add OpenAI API key to `.env`
2. Build: `npm run build`
3. Reload extension
4. Open article about Bitcoin, politics, sports, etc.
5. Hover over relevant text
6. Press `Ctrl+Shift+K`
7. Wait for alert

### Validation

✅ Alert shows OCR text + extracted keywords
✅ Keywords are relevant (e.g., "bitcoin, cryptocurrency, price")
✅ Takes <3 seconds total
✅ Works on different topics

**STOP HERE - Don't proceed until this works!**

---

## Phase 5: Toast UI - Show LLM Output (2-3 hours)

### Goal
Display keywords in a nice toast notification instead of alert.

### What to Build

**File: `src/content/toast.css`** (NEW)

```css
#hypergamblification-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 2147483647;
  opacity: 0;
  transform: translateY(-20px);
  transition: all 0.3s ease-out;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

#hypergamblification-toast.visible {
  opacity: 1;
  transform: translateY(0);
}

.hg-toast-container {
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  width: 350px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
}

.hg-toast-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.hg-toast-icon {
  font-size: 24px;
}

.hg-toast-title {
  flex: 1;
  font-weight: 600;
  font-size: 15px;
}

.hg-toast-close {
  background: none;
  border: none;
  color: white;
  font-size: 28px;
  cursor: pointer;
  padding: 0;
  width: 28px;
  height: 28px;
  line-height: 1;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.hg-toast-close:hover {
  opacity: 1;
}

.hg-toast-body {
  padding: 20px;
}

.hg-toast-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: #6b7280;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

.hg-toast-content {
  font-size: 16px;
  font-weight: 500;
  color: #111827;
  line-height: 1.5;
  margin-bottom: 16px;
}

.hg-toast-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hg-toast-keyword {
  padding: 6px 12px;
  background: #f3f4f6;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  font-weight: 500;
}
```

**File: `src/content/toast.ts`** (NEW)

```typescript
export function showKeywordToast(ocrText: string, keywords: string) {
  // Remove existing toast
  const existing = document.getElementById('hypergamblification-toast');
  if (existing) existing.remove();

  // Create toast element
  const toast = document.createElement('div');
  toast.id = 'hypergamblification-toast';

  const keywordArray = keywords.split(',').map(k => k.trim());

  toast.innerHTML = `
    <div class="hg-toast-container">
      <div class="hg-toast-header">
        <span class="hg-toast-icon">🎯</span>
        <span class="hg-toast-title">Content Detected</span>
        <button class="hg-toast-close">×</button>
      </div>
      <div class="hg-toast-body">
        <div class="hg-toast-label">Extracted Topics</div>
        <div class="hg-toast-keywords">
          ${keywordArray.map(kw => `<span class="hg-toast-keyword">${kw}</span>`).join('')}
        </div>
      </div>
    </div>
  `;

  // Inject styles if not already present
  if (!document.getElementById('hg-toast-styles')) {
    const link = document.createElement('link');
    link.id = 'hg-toast-styles';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('toast.css');
    document.head.appendChild(link);
  }

  // Add to page
  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  // Close button
  const closeBtn = toast.querySelector('.hg-toast-close');
  closeBtn?.addEventListener('click', hideToast);

  // Auto-dismiss after 8 seconds
  setTimeout(hideToast, 8000);
}

function hideToast() {
  const toast = document.getElementById('hypergamblification-toast');
  if (toast) {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }
}
```

**Update: `src/content/content.ts`**

```typescript
import { showKeywordToast } from './toast';

document.addEventListener('keydown', async (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'K') {
    console.log('[TEST] Starting analysis...');

    try {
      const regionDataUrl = await captureRegionAroundMouse(200);
      const text = await extractText(regionDataUrl);
      const keywords = await extractKeywords(text);

      // Show toast instead of alert
      showKeywordToast(text, keywords);

    } catch (error) {
      console.error('[TEST] Failed:', error);
    }
  }
});
```

**Update: `public/manifest.json`** - Add CSS to web_accessible_resources

```json
{
  "web_accessible_resources": [{
    "resources": ["toast.css"],
    "matches": ["<all_urls>"]
  }]
}
```

**Update: `webpack.config.js`** - Copy CSS file

```javascript
new CopyPlugin({
  patterns: [
    { from: 'public', to: '.' },
    { from: 'src/content/toast.css', to: 'toast.css' }
  ],
}),
```

### Testing

1. Build: `npm run build`
2. Reload extension
3. Open any article
4. Hover over text
5. Press `Ctrl+Shift+K`
6. Wait for toast to appear

### Validation

✅ Toast appears in top-right corner
✅ Shows extracted keywords as styled tags
✅ Animates in smoothly
✅ Auto-dismisses after 8 seconds
✅ Close button works
✅ Looks professional

**STOP HERE - This is MVP v1!**

---

## Phase 6: Auto-Trigger on Hover (3-4 hours)

### Goal
Automatically analyze content when user hovers for 2+ seconds.

### What to Build

**File: `src/content/hover-detector.ts`** (NEW)

```typescript
export class HoverDetector {
  private hoverTimeout: NodeJS.Timeout | null = null;
  private lastX: number = 0;
  private lastY: number = 0;
  private readonly HOVER_DELAY = 2000; // 2 seconds
  private readonly MOVEMENT_THRESHOLD = 50; // pixels

  start(onHover: () => void) {
    document.addEventListener('mousemove', (e) => {
      const moved = Math.abs(e.clientX - this.lastX) > this.MOVEMENT_THRESHOLD ||
                    Math.abs(e.clientY - this.lastY) > this.MOVEMENT_THRESHOLD;

      if (moved) {
        // Clear existing timeout
        if (this.hoverTimeout) {
          clearTimeout(this.hoverTimeout);
        }

        // Start new timeout
        this.hoverTimeout = setTimeout(() => {
          console.log('[HOVER] Detected 2s hover, triggering analysis...');
          onHover();
        }, this.HOVER_DELAY);

        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
  }
}
```

**Update: `src/content/content.ts`**

```typescript
import { HoverDetector } from './hover-detector';

const hoverDetector = new HoverDetector();

async function analyzeCurrentRegion() {
  console.log('[ANALYSIS] Starting...');

  try {
    const regionDataUrl = await captureRegionAroundMouse(200);
    const text = await extractText(regionDataUrl);

    // Only proceed if we got meaningful text
    if (text.length < 20) {
      console.log('[ANALYSIS] Not enough text, skipping');
      return;
    }

    const keywords = await extractKeywords(text);
    showKeywordToast(text, keywords);

  } catch (error) {
    console.error('[ANALYSIS] Failed:', error);
  }
}

// Auto-trigger on hover
hoverDetector.start(analyzeCurrentRegion);

// Manual trigger still works
document.addEventListener('keydown', async (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'K') {
    analyzeCurrentRegion();
  }
});
```

### Testing

1. Build: `npm run build`
2. Reload extension
3. Open article
4. Hover over a paragraph
5. **Stay still for 2 seconds**
6. Toast should appear automatically

### Validation

✅ Toast appears after 2s hover
✅ Moving mouse resets timer
✅ Doesn't trigger on short text (<20 chars)
✅ Can trigger multiple times
✅ Manual `Ctrl+Shift+K` still works

---

## MVP Complete! 🎉

At this point you have:
- ✅ Mouse-aware content detection
- ✅ OCR on relevant regions
- ✅ LLM keyword extraction
- ✅ Beautiful toast notifications
- ✅ Auto-trigger on hover

**Next Steps (After MVP Validation):**

1. **Week 2-3:** Show this to friends, test on real websites
2. **Week 4:** Integrate Sean's search API
3. **Week 5+:** Replace keywords with actual Kalshi markets

---

## Success Metrics for MVP

Before proceeding to Sean's API integration:

✅ Works on 5+ different websites (news, Twitter, Reddit, etc.)
✅ Keyword extraction is relevant >80% of the time
✅ No crashes or errors during normal browsing
✅ Performance acceptable (<3s from hover to toast)
✅ You & friends find it useful/interesting

---

## File Structure Summary

```
src/
├── background/
│   └── background.ts         # Screenshot capture
├── content/
│   ├── content.ts            # Main orchestration
│   ├── mouse-tracker.ts      # Track cursor position
│   ├── hover-detector.ts     # Detect 2s hovers
│   ├── toast.ts              # Toast UI component
│   └── toast.css             # Toast styling
├── lib/
│   ├── region-capture.ts     # Crop screenshot to region
│   ├── ocr.ts                # Tesseract.js wrapper
│   ├── llm-keywords.ts       # OpenAI keyword extraction
│   └── types.ts              # Shared types
└── popup/
    ├── popup.ts
    └── popup.html
```

---

## Total Time Estimate

- Phase 1: 2-3 hours
- Phase 2: 3-4 hours
- Phase 3: 2-3 hours
- Phase 4: 2-3 hours
- Phase 5: 2-3 hours
- Phase 6: 3-4 hours

**Total: 14-20 hours** (2-3 days of focused work)

---

## Cost for MVP

- OpenAI API: ~$0.0003 per analysis
- If 100 triggers/day: $0.03/day = **$0.90/month**
- Very cheap to test!

---

Ready to start Phase 1? 🚀
