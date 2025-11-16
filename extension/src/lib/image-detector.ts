// Image detection and context extraction for betting surface system

export interface ImageWithContext {
  element: HTMLImageElement;
  src: string;
  bounds: DOMRect;
  context: {
    alt: string;
    title: string;
    caption: string;
    headline: string;
    nearbyText: string;
    linkText: string;
  };
}

/**
 * Find all images on the page
 */
export function findAllImages(): HTMLImageElement[] {
  const images = Array.from(document.querySelectorAll('img'));

  // Filter out tiny images (likely icons/logos)
  return images.filter(img => {
    const bounds = img.getBoundingClientRect();
    return bounds.width >= 100 && bounds.height >= 100;
  });
}

/**
 * Extract text context around an image
 */
export function extractImageContext(img: HTMLImageElement): ImageWithContext {
  const bounds = img.getBoundingClientRect();

  return {
    element: img,
    src: img.src,
    bounds,
    context: {
      alt: img.alt || '',
      title: img.title || '',
      caption: findCaption(img),
      headline: findNearestHeadline(img),
      nearbyText: getNearbyText(img, 200),
      linkText: findLinkText(img)
    }
  };
}

/**
 * Find caption for an image (figcaption or nearby text)
 */
function findCaption(img: HTMLImageElement): string {
  // Check for <figcaption> in parent <figure>
  const figure = img.closest('figure');
  if (figure) {
    const figcaption = figure.querySelector('figcaption');
    if (figcaption) {
      return figcaption.textContent?.trim() || '';
    }
  }

  // Check for common caption classes
  const captionSelectors = [
    '.caption',
    '.image-caption',
    '.wp-caption-text',
    '[class*="caption"]'
  ];

  for (const selector of captionSelectors) {
    const caption = img.closest('div')?.querySelector(selector);
    if (caption) {
      return caption.textContent?.trim() || '';
    }
  }

  return '';
}

/**
 * Find nearest headline (h1, h2, h3)
 */
function findNearestHeadline(img: HTMLImageElement): string {
  // Look up the DOM tree for nearest headline
  let current: Element | null = img;

  while (current && current !== document.body) {
    // Check siblings first
    const parent: HTMLElement | null = current.parentElement;
    if (parent) {
      const headline = parent.querySelector('h1, h2, h3');
      if (headline) {
        return headline.textContent?.trim() || '';
      }
    }
    current = parent;
  }

  // Fallback: find any h1 on page
  const h1 = document.querySelector('h1');
  return h1?.textContent?.trim() || '';
}

/**
 * Get text content within radius of image
 */
function getNearbyText(img: HTMLImageElement, radiusChars: number = 200): string {
  const imgBounds = img.getBoundingClientRect();
  const imgCenter = {
    x: imgBounds.left + imgBounds.width / 2,
    y: imgBounds.top + imgBounds.height / 2
  };

  // Find all text nodes near the image
  const nearbyElements: Array<{ element: Element; distance: number; text: string }> = [];

  // Get all paragraphs and text containers
  const textElements = document.querySelectorAll('p, span, div, li');

  textElements.forEach(el => {
    const bounds = el.getBoundingClientRect();
    const text = el.textContent?.trim() || '';

    if (text.length < 10) return; // Skip very short text

    // Calculate distance from image center
    const elCenter = {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2
    };

    const distance = Math.sqrt(
      Math.pow(elCenter.x - imgCenter.x, 2) +
      Math.pow(elCenter.y - imgCenter.y, 2)
    );

    if (distance < 500) { // Within 500px
      nearbyElements.push({ element: el, distance, text });
    }
  });

  // Sort by distance, take closest text
  nearbyElements.sort((a, b) => a.distance - b.distance);

  const combinedText = nearbyElements
    .slice(0, 3) // Take 3 closest elements
    .map(item => item.text)
    .join(' ');

  // Truncate to radiusChars
  return combinedText.substring(0, radiusChars);
}

/**
 * Find link text if image is inside a link
 */
function findLinkText(img: HTMLImageElement): string {
  const link = img.closest('a');
  if (link) {
    // Get text content of link (excluding image alt)
    const text = link.textContent?.trim() || '';
    return text.replace(img.alt || '', '').trim();
  }
  return '';
}

/**
 * Check if image is in viewport
 */
export function isInViewport(img: HTMLImageElement): boolean {
  const bounds = img.getBoundingClientRect();
  return (
    bounds.top < window.innerHeight &&
    bounds.bottom > 0 &&
    bounds.left < window.innerWidth &&
    bounds.right > 0
  );
}
