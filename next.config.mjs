

const nextConfig = {
  images: {
    localPatterns: [
      { pathname: '/uploads/**' },
    ],
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'plus.unsplash.com' },
    ],
  },
};

export default nextConfig;
