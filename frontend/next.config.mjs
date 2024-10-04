/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  webpack: (config) => {
   config.resolve.alias.canvas = false;
       config.module.rules.push({
      test: /pdf\.worker\.entry\.js$/,
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
