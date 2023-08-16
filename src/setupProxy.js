const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
    app.use(
        /\/(dashboard|tautulli|plex|jellyfin|client|source|health)|(.+(deezer|callback))/i,
        createProxyMiddleware({
            target: 'http://localhost:9079',
            changeOrigin: true,
        })
    );
};
