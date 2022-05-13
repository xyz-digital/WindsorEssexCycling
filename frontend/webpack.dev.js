const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const Dotenv = require('dotenv-webpack');

module.exports = merge(common, {
  mode: 'development',
  devtool: 'inline-source-map',
  plugins: [
    new Dotenv({
      path: `./.env.dev`
    })
  ],
  devServer: {
    compress: true,
    port: 1234,
    hot: false,
  },
});
