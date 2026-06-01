/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Firebase Google OAuth popup requires same-origin-allow-popups
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
