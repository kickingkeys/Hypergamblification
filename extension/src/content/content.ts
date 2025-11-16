// Content script - runs on all pages

import { mouseTracker } from './mouse-tracker';
import { captureRegionAroundMouse, captureFullPageWithCircle } from '@/lib/region-capture';
import { findAllImages, extractImageContext, isInViewport } from '@/lib/image-detector';
import { viewportTracker } from '@/lib/viewport-tracker';

/**
 * Extract text from image using background script (avoids CSP issues)
 */
async function extractTextViaBackground(imageDataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'EXTRACT_TEXT', imageDataUrl },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve(response.text);
        } else {
          reject(new Error(response?.error || 'OCR failed'));
        }
      }
    );
  });
}

/**
 * Extract keywords from text using LLM via background script (legacy)
 */
async function extractKeywordsViaBackground(text: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'EXTRACT_KEYWORDS', text },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve(response.keywords);
        } else {
          reject(new Error(response?.error || 'Keyword extraction failed'));
        }
      }
    );
  });
}

/**
 * Extract keywords from image using vision LLM via background script
 */
async function extractKeywordsFromImageViaBackground(imageDataUrl: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'EXTRACT_KEYWORDS_FROM_IMAGE', imageDataUrl },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve(response.keywords);
        } else {
          reject(new Error(response?.error || 'Vision keyword extraction failed'));
        }
      }
    );
  });
}

/**
 * Convert HTML image element to data URL
 */
async function imageToDataURL(img: HTMLImageElement): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Set canvas dimensions to match image
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;

      // Draw image to canvas
      ctx.drawImage(img, 0, 0);

      // Convert to data URL
      try {
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      } catch (error) {
        // If CORS error, try using the image src directly
        if (img.src.startsWith('data:')) {
          resolve(img.src);
        } else {
          // Use src as fallback for cross-origin images
          resolve(img.src);
        }
      }
    } catch (error) {
      reject(error);
    }
  });
}

console.log('[HYPERGAMBLIFICATION] 🚀 Content script loaded');

// Start mouse tracking immediately
mouseTracker.start();

// Phase 1 test: Log mouse position every 5 seconds
setInterval(() => {
  const pos = mouseTracker.getPosition();
  const active = mouseTracker.isActive();

  console.log('[MOUSE] 📍 Position:', {
    x: pos.x,
    y: pos.y,
    tracking: active,
    timestamp: new Date().toLocaleTimeString()
  });
}, 5000);

// Phase 2 test: Capture region when user presses Ctrl+Shift+K (or Cmd+Shift+K on Mac)
document.addEventListener('keydown', async (e) => {
  // Debug: Log ALL Cmd/Ctrl+Shift key presses to see what's happening
  if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
    console.log('[TEST] 🔍 Modifier+Shift pressed:', {
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey
    });
  }

  // Check for Ctrl (Windows/Linux) or Cmd (Mac)
  const modifierKey = e.ctrlKey || e.metaKey;

  // NEW: Cmd+Shift+I - Test image detection system
  if (modifierKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
    console.log('[TEST] 🖼️ Cmd+Shift+I pressed - testing image detection...');

    try {
      // Find all images on page
      const images = findAllImages();
      console.log(`[TEST] ✅ Found ${images.length} images (>100x100px)`);

      if (images.length === 0) {
        alert('No images found on this page!');
        return;
      }

      // Extract context for all visible images
      const visibleImages = images.filter(isInViewport);
      console.log(`[TEST] ✅ ${visibleImages.length} images currently visible`);

      // Analyze first visible image
      if (visibleImages.length > 0) {
        const firstImage = extractImageContext(visibleImages[0]);

        console.log('[TEST] 🔍 First visible image context:', {
          src: firstImage.src,
          alt: firstImage.context.alt,
          caption: firstImage.context.caption,
          headline: firstImage.context.headline,
          nearbyText: firstImage.context.nearbyText.substring(0, 100) + '...',
          linkText: firstImage.context.linkText,
          bounds: {
            width: firstImage.bounds.width,
            height: firstImage.bounds.height
          }
        });

        // Show summary
        alert(`✅ Image Detection Test\n\n` +
          `Total images: ${images.length}\n` +
          `Visible: ${visibleImages.length}\n\n` +
          `First image context:\n` +
          `- Headline: ${firstImage.context.headline}\n` +
          `- Caption: ${firstImage.context.caption}\n` +
          `- Alt: ${firstImage.context.alt}\n\n` +
          `Check console for full details!`);
      }

    } catch (error) {
      console.error('[TEST] ❌ Image detection test failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`❌ Test failed: ${errorMessage}`);
    }
  }

  // NEW: Cmd+Shift+J - Test multi-modal vision (image + context)
  if (modifierKey && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
    console.log('[TEST] 🎯 Cmd+Shift+J pressed - testing multi-modal vision...');

    try {
      // Find first visible image
      const images = findAllImages();
      const visibleImages = images.filter(isInViewport);

      if (visibleImages.length === 0) {
        alert('No visible images found!');
        return;
      }

      const firstImage = extractImageContext(visibleImages[0]);
      console.log('[TEST] 📸 Analyzing image with context:', firstImage.context);

      // Convert image to data URL
      const imageDataUrl = await imageToDataURL(firstImage.element);
      console.log('[TEST] ✅ Image converted to data URL, size:', imageDataUrl.length);

      // Extract keywords with context via background script
      const keywords = await chrome.runtime.sendMessage({
        type: 'EXTRACT_KEYWORDS_WITH_CONTEXT',
        imageDataUrl: imageDataUrl,
        context: {
          alt: firstImage.context.alt,
          caption: firstImage.context.caption,
          headline: firstImage.context.headline,
          nearbyText: firstImage.context.nearbyText
        }
      });

      if (keywords.success) {
        console.log('[TEST] ✅ Multi-modal keywords:', keywords.keywords);

        // Show results
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(`
            <html>
              <head>
                <title>Multi-Modal Vision Test</title>
                <style>
                  body {
                    margin: 0;
                    padding: 20px;
                    background: #f5f5f5;
                    font-family: system-ui;
                  }
                  .container {
                    max-width: 1200px;
                    margin: 0 auto;
                  }
                  img {
                    max-width: 100%;
                    border: 2px solid #333;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                  }
                  .context-box {
                    background: white;
                    padding: 20px;
                    margin: 20px 0;
                    border-radius: 8px;
                    border: 2px solid #2196F3;
                  }
                  .context-item {
                    margin: 10px 0;
                    padding: 10px;
                    background: #f9f9f9;
                    border-left: 4px solid #2196F3;
                  }
                  .keywords {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    margin-top: 10px;
                  }
                  .keyword {
                    padding: 8px 16px;
                    background: #4CAF50;
                    color: white;
                    border-radius: 20px;
                    font-weight: bold;
                  }
                  h2 {
                    color: #333;
                  }
                  .badge {
                    display: inline-block;
                    padding: 4px 12px;
                    background: #FF9800;
                    color: white;
                    border-radius: 12px;
                    font-size: 12px;
                    margin-left: 10px;
                  }
                </style>
              </head>
              <body>
                <div class="container">
                  <h2>🎯 Multi-Modal Vision Test <span class="badge">Image + Context</span></h2>

                  <div class="context-box">
                    <h3>📝 Text Context Provided:</h3>
                    ${firstImage.context.headline ? `<div class="context-item"><strong>Headline:</strong> ${firstImage.context.headline}</div>` : ''}
                    ${firstImage.context.caption ? `<div class="context-item"><strong>Caption:</strong> ${firstImage.context.caption}</div>` : ''}
                    ${firstImage.context.alt ? `<div class="context-item"><strong>Alt Text:</strong> ${firstImage.context.alt}</div>` : ''}
                    ${firstImage.context.nearbyText ? `<div class="context-item"><strong>Nearby Text:</strong> ${firstImage.context.nearbyText.substring(0, 200)}...</div>` : ''}
                  </div>

                  <div style="background: white; padding: 20px; border-radius: 8px;">
                    <h3>📷 Image Analyzed:</h3>
                    <img src="${imageDataUrl}" />
                  </div>

                  <div style="background: white; padding: 20px; margin-top: 20px; border-radius: 8px; border: 2px solid #4CAF50;">
                    <h3>🔑 Keywords Extracted (${keywords.keywords.length}):</h3>
                    <div class="keywords">
                      ${keywords.keywords.map((k: string) => `<span class="keyword">${k}</span>`).join('')}
                    </div>
                    <p style="margin-top: 15px; color: #666; font-size: 14px;">
                      ✅ Keywords generated using <strong>image + text context</strong> via GPT-4o-mini vision
                    </p>
                  </div>
                </div>
              </body>
            </html>
          `);
          win.document.close();
        }
      } else {
        throw new Error(keywords.error);
      }

    } catch (error) {
      console.error('[TEST] ❌ Multi-modal test failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`❌ Test failed: ${errorMessage}`);
    }
  }

  // NEW: Cmd+Shift+K - Display neon pink keywords on visible images
  if (modifierKey && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
    console.log('[TEST] 💖 Cmd+Shift+K pressed - displaying neon pink keywords on images...');

    try {
      // Find all visible images
      const images = findAllImages();
      const visibleImages = images.filter(isInViewport);

      if (visibleImages.length === 0) {
        alert('No visible images found!');
        return;
      }

      console.log(`[TEST] 📸 Found ${visibleImages.length} visible images, extracting keywords...`);

      // Inject neon pink styles if not present
      if (!document.getElementById('hg-neon-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'hg-neon-styles';
        styleSheet.textContent = `
          .hg-keyword-overlay {
            position: absolute;
            z-index: 999999;
            pointer-events: none;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            padding: 12px;
            max-width: 300px;
          }

          .hg-keyword-tag {
            padding: 6px 14px;
            background: rgba(255, 20, 147, 0.9);
            color: white;
            border-radius: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 13px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            box-shadow: 0 0 20px rgba(255, 20, 147, 0.8),
                        0 0 40px rgba(255, 20, 147, 0.5),
                        0 4px 12px rgba(0, 0, 0, 0.4);
            animation: hgNeonPulse 2s ease-in-out infinite;
          }

          @keyframes hgNeonPulse {
            0%, 100% {
              box-shadow: 0 0 20px rgba(255, 20, 147, 0.8),
                          0 0 40px rgba(255, 20, 147, 0.5),
                          0 4px 12px rgba(0, 0, 0, 0.4);
            }
            50% {
              box-shadow: 0 0 30px rgba(255, 20, 147, 1),
                          0 0 60px rgba(255, 20, 147, 0.7),
                          0 4px 12px rgba(0, 0, 0, 0.4);
            }
          }
        `;
        document.head.appendChild(styleSheet);
      }

      // Process each visible image
      const overlays: HTMLDivElement[] = [];
      let successCount = 0;

      for (let i = 0; i < visibleImages.length; i++) {
        const img = visibleImages[i];
        console.log(`[TEST] 🔄 Processing image ${i + 1}/${visibleImages.length}...`);

        try {
          // Extract context
          const imageContext = extractImageContext(img);

          // Log context quality
          const contextScore = [
            imageContext.context.alt,
            imageContext.context.caption,
            imageContext.context.headline,
            imageContext.context.nearbyText
          ].filter(c => c && c.length > 0).length;

          console.log(`[TEST] 📋 Image ${i + 1} context: ${contextScore}/4 fields populated`);

          // Convert to data URL
          const imageDataUrl = await imageToDataURL(img);
          const isDataUrl = imageDataUrl.startsWith('data:');
          const dataType = isDataUrl ? 'data URL' : 'http URL';
          const dataSize = isDataUrl ? Math.round(imageDataUrl.length / 1024) + 'KB' : imageDataUrl.substring(0, 50) + '...';

          console.log(`[TEST] 🖼️ Image ${i + 1} converted: ${dataType} (${dataSize})`);

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
            // Create overlay with neon pink keywords
            const overlay = document.createElement('div');
            overlay.className = 'hg-keyword-overlay';

            // Position at top-left of image (absolute positioning on page)
            const bounds = img.getBoundingClientRect();
            overlay.style.top = `${window.scrollY + bounds.top + 12}px`;
            overlay.style.left = `${window.scrollX + bounds.left + 12}px`;

            // Add keyword tags
            response.keywords.forEach((keyword: string) => {
              const tag = document.createElement('span');
              tag.className = 'hg-keyword-tag';
              tag.textContent = keyword;
              overlay.appendChild(tag);
            });

            document.body.appendChild(overlay);
            overlays.push(overlay);
            successCount++;

            console.log(`[TEST] ✅ Image ${i + 1}: ${response.keywords.length} keywords - ${response.keywords.join(', ')}`);
          } else {
            console.log(`[TEST] ⚠️ Image ${i + 1}: No keywords extracted - Error: ${response.error || 'Unknown reason'}`);
          }

        } catch (error) {
          console.error(`[TEST] ❌ Image ${i + 1} failed:`, error);
        }
      }

      // Store overlays for cleanup
      (window as any).__hgKeywordOverlays = overlays;

      // Show summary
      alert(`💖 Neon Pink Keywords Test\n\n` +
        `✅ ${successCount}/${visibleImages.length} images processed\n\n` +
        `Keywords displayed with neon pink glow!\n\n` +
        `Press Cmd+Shift+O to remove overlays`);

    } catch (error) {
      console.error('[TEST] ❌ Neon pink keyword test failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`❌ Test failed: ${errorMessage}`);
    }
  }

  // Cmd+Shift+O - Remove keyword overlays
  if (modifierKey && e.shiftKey && (e.key === 'O' || e.key === 'o')) {
    console.log('[TEST] 🧹 Cmd+Shift+O pressed - removing keyword overlays...');

    const overlays = (window as any).__hgKeywordOverlays as HTMLDivElement[] | undefined;
    if (overlays && overlays.length > 0) {
      overlays.forEach(overlay => overlay.remove());
      (window as any).__hgKeywordOverlays = [];
      console.log(`[TEST] ✅ Removed ${overlays.length} overlays`);
      alert(`✅ Removed ${overlays.length} keyword overlays`);
    } else {
      alert('No keyword overlays to remove!');
    }
  }

  // NEW: Cmd+Shift+A - Toggle AUTO viewport tracking
  if (modifierKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
    console.log('[VIEWPORT] 🎯 Cmd+Shift+A pressed - toggling auto-tracking...');

    if (viewportTracker.isActive()) {
      // Disable auto-tracking
      viewportTracker.stop();
      alert(`🛑 Auto-tracking DISABLED\n\nKeyword overlays stopped.\nExisting overlays cleared.`);
    } else {
      // Enable auto-tracking
      viewportTracker.start();
      const stats = viewportTracker.getStats();
      alert(`🚀 Auto-tracking ENABLED!\n\n` +
        `Tracking ${stats.total} images.\n\n` +
        `Keywords will appear automatically as you scroll!\n\n` +
        `Press Cmd+Shift+A again to disable.`);
    }
  }
});

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_SCREEN') {
    handleScreenCapture()
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function handleScreenCapture() {
  console.log('[HYPERGAMBLIFICATION] Capturing screen...');
  return { message: 'Screen capture not yet implemented' };
}
