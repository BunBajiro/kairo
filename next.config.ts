// Vinext/Next compatibility options for the static local dashboard. EVE images
// retain their provider URLs; this config does not introduce a local image proxy.
import type { NextConfig } from 'next';
const nextConfig: NextConfig = { output: 'export', images: { unoptimized: true } };
export default nextConfig;
