import { createHomeOgImage } from '@/lib/og';
import { appTitle } from '@/lib/shared';

export const alt = appTitle;
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';
export const revalidate = false;

export default async function Image() {
  return createHomeOgImage();
}
