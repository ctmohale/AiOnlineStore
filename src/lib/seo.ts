type SeoInput = { title: string; description: string; canonical: string; image?: string; type?: 'website' | 'product'; jsonLd?: Record<string, unknown> };

const ensureMeta = (selector: string, attribute: 'name' | 'property', key: string) => {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) { element = document.createElement('meta'); element.setAttribute(attribute, key); document.head.append(element); }
  return element;
};

export function setPageSeo(input: SeoInput) {
  document.title = input.title;
  ensureMeta('meta[name="description"]', 'name', 'description').content = input.description;
  ensureMeta('meta[property="og:type"]', 'property', 'og:type').content = input.type || 'website';
  ensureMeta('meta[property="og:title"]', 'property', 'og:title').content = input.title;
  ensureMeta('meta[property="og:description"]', 'property', 'og:description').content = input.description;
  ensureMeta('meta[property="og:url"]', 'property', 'og:url').content = input.canonical;
  ensureMeta('meta[name="twitter:card"]', 'name', 'twitter:card').content = 'summary_large_image';
  ensureMeta('meta[name="twitter:title"]', 'name', 'twitter:title').content = input.title;
  ensureMeta('meta[name="twitter:description"]', 'name', 'twitter:description').content = input.description;
  if (input.image) {
    ensureMeta('meta[property="og:image"]', 'property', 'og:image').content = input.image;
    ensureMeta('meta[name="twitter:image"]', 'name', 'twitter:image').content = input.image;
  }
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
  canonical.href = input.canonical;
  document.getElementById('page-json-ld')?.remove();
  if (input.jsonLd) { const script = document.createElement('script'); script.id = 'page-json-ld'; script.type = 'application/ld+json'; script.textContent = JSON.stringify(input.jsonLd); document.head.append(script); }
}

export const storeUrl = () => `${window.location.origin}`;
