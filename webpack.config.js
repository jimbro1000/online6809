const {resolve} = require('path');
module.exports = {
  entry: './src/emulator.js',
  output: {
    path: resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    library: 'bundle',
  },
  mode: 'production',
  // mode: 'development',
}