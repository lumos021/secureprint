/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.module.rules.push({
      test: /pdf\.worker\.(min\.)?mjs/,
      use: [
        {
          loader: 'file-loader',
          options: {
            name: '[name].[ext]',
            outputPath: 'static/js/',
            publicPath: '/_next/static/js/',
          },
        },
      ],
    });

    return config;
  },
};

export default nextConfig;
