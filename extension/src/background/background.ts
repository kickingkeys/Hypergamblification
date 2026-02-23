// Background service worker

import { extractText } from '@/lib/ocr';
import { extractKeywords, extractKeywordsFromImage, extractKeywordsFromImageWithContext, saveOpenAIKey } from '@/lib/llm';
import { findBestMarket } from '@/lib/kalshi-api';

console.log('[HYPERGAMBLIFICATION-BG] 🟢 Background service worker loaded');

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[HYPERGAMBLIFICATION-BG] 📨 Message received:', message.type);

  // Handle screenshot capture requests
  if (message.type === 'CAPTURE_SCREENSHOT') {
    console.log('[HYPERGAMBLIFICATION-BG] 📸 Capturing screenshot...');

    chrome.tabs.captureVisibleTab(
      { format: 'png' },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error('[HYPERGAMBLIFICATION-BG] ❌ Capture failed:', chrome.runtime.lastError);
          sendResponse({
            success: false,
            error: chrome.runtime.lastError.message
          });
        } else {
          console.log('[HYPERGAMBLIFICATION-BG] ✅ Screenshot captured, size:', dataUrl.length);
          sendResponse({
            success: true,
            dataUrl: dataUrl
          });
        }
      }
    );
    return true; // Keep channel open for async response
  }

  // Handle OCR requests (runs in background to avoid CSP issues)
  if (message.type === 'EXTRACT_TEXT') {
    console.log('[HYPERGAMBLIFICATION-BG] 📖 OCR request received');

    extractText(message.imageDataUrl)
      .then(text => {
        console.log('[HYPERGAMBLIFICATION-BG] ✅ OCR complete, text length:', text.length);
        sendResponse({ success: true, text });
      })
      .catch(error => {
        console.error('[HYPERGAMBLIFICATION-BG] ❌ OCR failed:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'OCR failed'
        });
      });

    return true; // Keep channel open for async response
  }

  // Handle keyword extraction requests (text-based - legacy)
  if (message.type === 'EXTRACT_KEYWORDS') {
    console.log('[HYPERGAMBLIFICATION-BG] 🤖 Keyword extraction request received');

    extractKeywords(message.text)
      .then(keywords => {
        console.log('[HYPERGAMBLIFICATION-BG] ✅ Keywords extracted:', keywords);
        sendResponse({ success: true, keywords });
      })
      .catch(error => {
        console.error('[HYPERGAMBLIFICATION-BG] ❌ Keyword extraction failed:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Keyword extraction failed'
        });
      });

    return true; // Keep channel open for async response
  }

  // Handle vision-based keyword extraction (new)
  if (message.type === 'EXTRACT_KEYWORDS_FROM_IMAGE') {
    console.log('[HYPERGAMBLIFICATION-BG] 🤖 Vision-based keyword extraction request received');

    extractKeywordsFromImage(message.imageDataUrl)
      .then(keywords => {
        console.log('[HYPERGAMBLIFICATION-BG] ✅ Keywords extracted from image:', keywords);
        sendResponse({ success: true, keywords });
      })
      .catch(error => {
        console.error('[HYPERGAMBLIFICATION-BG] ❌ Vision keyword extraction failed:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Vision keyword extraction failed'
        });
      });

    return true; // Keep channel open for async response
  }

  // FAST PATH: Direct keyword → market search (skips LLM entirely)
  if (message.type === 'SEARCH_MARKETS_DIRECT') {
    console.log('[HYPERGAMBLIFICATION-BG] ⚡ Fast path: direct market search for keywords:', message.keywords);

    findBestMarket(message.keywords)
      .then(market => {
        if (market) {
          console.log('[HYPERGAMBLIFICATION-BG] ⚡ Fast match:', market.title);
          sendResponse({ success: true, market });
        } else {
          console.log('[HYPERGAMBLIFICATION-BG] ⚡ No fast match found');
          sendResponse({ success: true, market: null });
        }
      })
      .catch(error => {
        console.error('[HYPERGAMBLIFICATION-BG] ❌ Fast search failed:', error);
        sendResponse({ success: false, error: error instanceof Error ? error.message : 'Fast search failed' });
      });

    return true;
  }

  // Handle multi-modal keyword extraction (image + text context) + market search
  if (message.type === 'EXTRACT_KEYWORDS_WITH_CONTEXT') {
    console.log('[HYPERGAMBLIFICATION-BG] 🎯 Multi-modal keyword extraction request received');

    extractKeywordsFromImageWithContext(message.imageDataUrl, message.context)
      .then(async keywords => {
        console.log('[HYPERGAMBLIFICATION-BG] ✅ Multi-modal keywords extracted:', keywords);

        // Search for best matching market
        const market = await findBestMarket(keywords);

        if (market) {
          console.log('[HYPERGAMBLIFICATION-BG] 🏆 Best market found:', market.title);
          sendResponse({ success: true, keywords, market });
        } else {
          console.log('[HYPERGAMBLIFICATION-BG] ⚠️ No markets found for keywords');
          sendResponse({ success: true, keywords, market: null });
        }
      })
      .catch(error => {
        console.error('[HYPERGAMBLIFICATION-BG] ❌ Multi-modal keyword extraction failed:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Multi-modal keyword extraction failed'
        });
      });

    return true; // Keep channel open for async response
  }

  // Handle API key save requests
  if (message.type === 'SAVE_OPENAI_KEY') {
    console.log('[HYPERGAMBLIFICATION-BG] 🔑 Saving OpenAI API key');

    saveOpenAIKey(message.apiKey)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('[HYPERGAMBLIFICATION-BG] ❌ Failed to save API key:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save API key'
        });
      });

    return true; // Keep channel open for async response
  }

  if (message.type === 'ANALYZE_PAGE') {
    handleAnalyzeRequest(message.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_STATUS') {
    sendResponse({ enabled: true, version: '0.1.0' });
  }
});

async function handleAnalyzeRequest(data: any) {
  console.log('[HYPERGAMBLIFICATION-BG] Analyzing:', data);
  return {
    message: 'Analysis not yet implemented',
    markets: []
  };
}

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[HYPERGAMBLIFICATION-BG] 🎉 Extension installed');

  chrome.storage.local.set({
    config: {
      enabled: true,
      ocrInterval: 10000,
      minConfidence: 0.7,
      cacheExpiry: 300000
    }
  });
});
