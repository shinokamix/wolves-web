const path = require('node:path');
const pkg = require('./package');

module.exports = {
  apiPath: 'stubs/api',
  webpackConfig: {
    output: { publicPath: `/static/${pkg.name}/${process.env.VERSION || pkg.version}/` },
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  },
  navigations: { 'wolves-web.main': '/wolves-web' },
  features: { 'wolves-web': {} },
  config: {
    'wolves-web.api': '/api',
    'wolves-web.agent': process.env.AGENT_URL || 'http://localhost:8787',
    'wolves-web.google-maps-key': process.env.GOOGLE_MAPS_PUBLIC_KEY || '',
  },
  htmlTemplatePath: undefined,
};
