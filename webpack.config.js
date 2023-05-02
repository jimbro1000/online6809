const {resolve} = require('path');
module.exports = {
  entry: './src/emulator.js',
  output: {
    path: resolve(__dirname, 'dist'),
    filename: 'bundle.js',
  },
  mode: 'production',
  // mode: 'development',
}