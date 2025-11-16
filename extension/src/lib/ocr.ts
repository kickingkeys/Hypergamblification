// OCR service using OCR.space API
// Free tier: https://ocr.space/ocrapi

const OCR_API_KEY = 'K87899142388957'; // Free public API key
const OCR_API_URL = 'https://api.ocr.space/parse/image';

/**
 * Extract text from an image data URL using OCR.space API
 */
export async function extractText(imageDataUrl: string): Promise<string> {
  console.log('[OCR] 📖 Starting text extraction via OCR.space...');

  try {
    // Convert data URL to base64 (remove the data:image/png;base64, prefix)
    const base64Image = imageDataUrl.split(',')[1];

    // Make API request
    const formData = new FormData();
    formData.append('base64Image', `data:image/png;base64,${base64Image}`);
    formData.append('apikey', OCR_API_KEY);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2'); // Use OCR Engine 2 (better for text)

    const response = await fetch(OCR_API_URL, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`OCR API error: ${response.status}`);
    }

    const result = await response.json();

    if (result.IsErroredOnProcessing) {
      throw new Error(result.ErrorMessage?.[0] || 'OCR processing error');
    }

    // Extract text from all parsed results
    const text = result.ParsedResults?.[0]?.ParsedText || '';
    const trimmedText = text.trim();

    console.log('[OCR] ✅ Text extracted:', {
      length: trimmedText.length,
      preview: trimmedText.substring(0, 100)
    });

    return trimmedText;

  } catch (error) {
    console.error('[OCR] ❌ Extraction failed:', error);
    throw error;
  }
}
