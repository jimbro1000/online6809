const {resolve} = require('path');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
module.exports = {
  resolve: {
    fallback: {
      "fs": false,
    },
  },
  entry: './src/emulator.js',
  output: {
    path: resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    library: 'bundle',
  },
  plugins: [
      new NodePolyfillPlugin(),
  ],
  // mode: 'production',
  mode: 'development',
}