import type { MetadataRoute } from 'next';
import { pageUrl } from '@/lib/metadata';
import { source } from '@/lib/source';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ['/', '/changelog', ...source.getPages().map((page) => page.url)];

  return [...new Set(paths.map(pageUrl))].map((url) => ({ url }));
}
