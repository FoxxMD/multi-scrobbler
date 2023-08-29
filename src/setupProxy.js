const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
    app.use(
        /\/(api|dashboard|tautulli|plex|jellyfin|client|source|health)|(.+(deezer|callback))/i,
        createProxyMiddleware({
            target: `http://localhost:${process.env.API_PORT ?? 9079}`,
            changeOrigin: true,
        })
    );
};
