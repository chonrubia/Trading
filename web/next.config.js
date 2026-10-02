/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // lib/ vive en TypeScript: resuelve imports estilo ESM (.js -> .ts/.tsx)
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};
module.exports = nextConfig;
