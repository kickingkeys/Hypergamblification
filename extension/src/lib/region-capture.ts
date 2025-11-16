// Capture a region of the screen around the mouse cursor

import { mouseTracker } from '../content/mouse-tracker';

/**
 * Capture full page screenshot with red circle at mouse position
 */
export async function captureFullPageWithCircle(): Promise<string> {
  console.log('[CAPTURE] 📸 Capturing full page with mouse indicator...');

  try {
    // Step 1: Get full page screenshot
    const fullScreenshot = await captureFullScreen();
    console.log('[CAPTURE] ✅ Full screenshot captured');

    // Step 2: Get current mouse position
    const { x, y } = mouseTracker.getPosition();
    console.log('[CAPTURE] 📍 Mouse position:', { x, y });

    // Step 3: Draw red circle at mouse position
    const markedScreenshot = await drawCircleAtPosition(fullScreenshot, x, y);
    console.log('[CAPTURE] ✅ Red circle added at mouse position');

    return markedScreenshot;

  } catch (error) {
    console.error('[CAPTURE] ❌ Failed:', error);
    throw error;
  }
}

/**
 * Capture region around mouse (legacy - for backward compatibility)
 */
export async function captureRegionAroundMouse(
  radius: number = 200
): Promise<string> {
  console.log('[CAPTURE] 📸 Starting region capture, radius:', radius);

  try {
    // Step 1: Get full page screenshot from background script
    const fullScreenshot = await captureFullScreen();
    console.log('[CAPTURE] ✅ Full screenshot captured');

    // Step 2: Get current mouse position
    const { x, y } = mouseTracker.getPosition();
    console.log('[CAPTURE] 📍 Mouse position:', { x, y });

    // Step 3: Crop to region around mouse
    const regionDataUrl = await cropImage(fullScreenshot, x, y, radius);
    console.log('[CAPTURE] ✅ Region cropped successfully');

    return regionDataUrl;

  } catch (error) {
    console.error('[CAPTURE] ❌ Failed:', error);
    throw error;
  }
}

async function captureFullScreen(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'CAPTURE_SCREENSHOT' },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve(response.dataUrl);
        } else {
          reject(new Error(response?.error || 'Screenshot capture failed'));
        }
      }
    );
  });
}

/**
 * Draw a red circle at the specified position on the screenshot
 */
async function drawCircleAtPosition(
  dataUrl: string,
  x: number,
  y: number,
  radius: number = 50
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      // Set canvas to image dimensions
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw the original image
      ctx.drawImage(img, 0, 0);

      // Draw red circle at mouse position
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.stroke();

      // Optional: Add a semi-transparent fill
      ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
      ctx.fill();

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => {
      console.error('[CAPTURE] ❌ Image load failed');
      resolve(''); // Return empty string on error
    };

    img.src = dataUrl;
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

      // Calculate crop coordinates (centered on mouse)
      const sx = Math.max(0, centerX - radius);
      const sy = Math.max(0, centerY - radius);
      const sw = Math.min(size, img.width - sx);
      const sh = Math.min(size, img.height - sy);

      // Draw cropped region
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => {
      console.error('[CAPTURE] ❌ Image load failed');
      resolve(''); // Return empty string on error
    };

    img.src = dataUrl;
  });
}
