import type { Metadata } from 'next';
import { appName, siteUrl } from './shared';

/** Resolve site-relative routes while preserving a deployment subdirectory. */
export function pageUrl(path: string): string {
  const base = `${siteUrl.replace(/\/+$/, '')}/`;
  return new URL(path.replace(/^\/+|\/+$/g, '') + (path === '/' ? '' : '/'), base).href;
}

export function createPageMetadata({
  title,
  description,
  path,
  image = '/opengraph-image',
  absoluteTitle = false,
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
  absoluteTitle?: boolean;
}): Metadata {
  const fullTitle = absoluteTitle ? title : `${title} | ${appName}`;
  const images = [
    {
      url: new URL(image.replace(/^\/+/, ''), `${siteUrl.replace(/\/+$/, '')}/`).href,
      width: 1200,
      height: 630,
      alt: fullTitle,
    },
  ];

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: pageUrl(path) },
    openGraph: {
      type: 'website',
      url: pageUrl(path),
      siteName: appName,
      locale: 'en_US',
      title: fullTitle,
      description,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images,
    },
  };
}
