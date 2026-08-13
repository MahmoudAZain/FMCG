import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Supabase Storage serves product imagery. Remote patterns are added when the
  // project URL is known; keeping the list explicit avoids opening the optimizer
  // to arbitrary hosts.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },

  // A type error must fail the build rather than be deferred.
  typescript: { ignoreBuildErrors: false },

  // Lint is a separate CI gate (see .github/workflows/ci.yml) rather than part
  // of the build, so a build doesn't pay for it twice. That gate is where the
  // right-to-left rule is enforced.
  eslint: { ignoreDuringBuilds: true },
};

export default withNextIntl(nextConfig);
