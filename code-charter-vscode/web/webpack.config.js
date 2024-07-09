const path = require('path');
const CopyPlugin = require("copy-webpack-plugin");
module.exports = {
  entry: './src/index.tsx',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 9000,
    devMiddleware: {
      writeToDisk: true,  // This will write the files to disk
    },
    allowedHosts: 'all',
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: 'node_modules/@hpcc-js/wasm/dist/graphvizlib.wasm',
          to: 'build/@hpcc-js/wasm/dist'
        },
        {
          from: 'node_modules/@hpcc-js/wasm/dist/index.min.js',
          to: 'build/@hpcc-js/wasm/dist'
        }
      ]
    }),
  ],
};
