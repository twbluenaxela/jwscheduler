export default function manifest() {
  return {
    name: '聚會安排',
    short_name: '聚會安排',
    description: 'JW 會眾聚會編排系統',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ecebe7',
    theme_color: '#2f6f8f',
    lang: 'zh-Hant',
    icons: [
      {
        src: '/jwschedulerlogo.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/jwschedulerlogo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/jwschedulerlogo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
