// LLM service for keyword extraction using OpenAI GPT-4o-mini with vision

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini'; // Fast, cheap, reliable with vision support

/**
 * Extract prediction market keywords from screenshot with red circle indicator
 */
export async function extractKeywordsFromImage(imageDataUrl: string): Promise<string[]> {
  console.log('[LLM] 🤖 Extracting keywords from screenshot with vision...');

  try {
    // Get API key from Chrome storage
    const apiKey = await getOpenAIKey();

    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Please set it in extension settings.');
    }

    // Craft prompt for vision-based keyword extraction
    const prompt = `Look at this screenshot. There is a RED CIRCLE showing where the user is focused.

Extract 3-5 keywords about what's near the red circle. Include:
- Main topic
- Key subjects
- Events or trends mentioned

Return ONLY a JSON array. Example: ["technology", "sports", "politics"]`;

    return await callVisionAPI(apiKey, imageDataUrl, prompt);
  } catch (error) {
    console.error('[LLM] ❌ Keyword extraction failed:', error);
    throw error;
  }
}

/**
 * Extract keywords from image with text context (for image-based betting)
 */
export async function extractKeywordsFromImageWithContext(
  imageDataUrl: string,
  context: {
    alt?: string;
    caption?: string;
    headline?: string;
    nearbyText?: string;
  }
): Promise<string[]> {
  console.log('[LLM] 🤖 Extracting keywords with multi-modal context...');

  try {
    const apiKey = await getOpenAIKey();
    if (!apiKey) {
      throw new Error('OpenAI API key not configured.');
    }

    // Build context string
    const contextParts = [];
    if (context.headline) contextParts.push(`Headline: "${context.headline}"`);
    if (context.caption) contextParts.push(`Caption: "${context.caption}"`);
    if (context.alt) contextParts.push(`Alt text: "${context.alt}"`);
    if (context.nearbyText) contextParts.push(`Nearby text: "${context.nearbyText}"`);

    const contextString = contextParts.join('\n');

    const prompt = `You are helping search a prediction market database (Kalshi). Given the image and context, generate SHORT search queries that would match real betting markets.

CONTEXT:
${contextString}

RULES:
- Each keyword must be 1-3 words MAX (e.g. "Trump", "government shutdown", "recession")
- Think about what people BET on: elections, wars, economic indicators, weather events, sports outcomes, policy decisions
- Use the BROADEST relevant topic (e.g. "tariffs" not "semiconductor tariff policy")
- Include the most prominent person/entity name if relevant (e.g. "Trump", "Fed", "Tesla")
- Generate 4-6 keywords, ordered from most to least relevant

Return ONLY a JSON array. Example: ["government shutdown", "Trump", "tariffs", "recession", "immigration"]`;

    return await callVisionAPI(apiKey, imageDataUrl, prompt);
  } catch (error) {
    console.error('[LLM] ❌ Multi-modal keyword extraction failed:', error);
    throw error;
  }
}

/**
 * Shared vision API call function
 */
async function callVisionAPI(
  apiKey: string,
  imageDataUrl: string,
  prompt: string
): Promise<string[]> {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You generate short search queries for prediction market databases. Return only JSON arrays of 1-3 word search terms. Never use phrases longer than 3 words.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: imageDataUrl
              }
            }
          ]
        }
      ],
      temperature: 0.5,
      max_completion_tokens: 100
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content || '[]';

  // Strip markdown code blocks if present (```json ... ```)
  const cleanedContent = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Parse JSON array of keywords
  const keywords = JSON.parse(cleanedContent);
  return keywords;
}

/**
 * Legacy text-based extraction (kept for backward compatibility)
 */
export async function extractKeywords(ocrText: string): Promise<string[]> {
  console.log('[LLM] 🤖 Extracting keywords from text (legacy)...');

  try {
    const apiKey = await getOpenAIKey();
    if (!apiKey) {
      throw new Error('OpenAI API key not configured.');
    }

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a keyword extraction system. Return only JSON arrays of keywords.'
          },
          {
            role: 'user',
            content: `Extract 3-5 keywords for prediction markets from: "${ocrText}". Return JSON array only.`
          }
        ],
        temperature: 0.5,
        max_completion_tokens: 100
      })
    });

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || '[]';

    // Strip markdown code blocks if present
    const cleanedContent = content
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const keywords = JSON.parse(cleanedContent);
    return keywords;
  } catch (error) {
    console.error('[LLM] ❌ Keyword extraction failed:', error);
    throw error;
  }
}

/**
 * Get OpenAI API key from Chrome storage
 */
async function getOpenAIKey(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['openai_api_key'], (result) => {
      resolve(result.openai_api_key || null);
    });
  });
}

/**
 * Save OpenAI API key to Chrome storage
 */
export async function saveOpenAIKey(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ openai_api_key: apiKey }, () => {
      console.log('[LLM] ✅ API key saved');
      resolve();
    });
  });
}
