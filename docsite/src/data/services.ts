export interface Service {
	name: string;
	/** site-relative docs path, base is added when rendered */
	href: string;
	/** filename (without .svg) in src/client/components/icons/custom. Omitted = initials avatar */
	icon?: string;
	note?: string;
}

export const sources: Service[] = [
	{ name: 'Apple Music', href: '/configuration/sources/applemusic', icon: 'apple-music' },
	{ name: 'Azuracast', href: '/configuration/sources/azuracast', icon: 'azuracast' },
	{ name: 'Deezer', href: '/configuration/sources/deezer', icon: 'deezer' },
	{ name: 'Google Cast', href: '/configuration/sources/google-cast', icon: 'google-chrome', note: 'Chromecast' },
	{ name: 'Icecast', href: '/configuration/sources/icecast', icon: 'icecast' },
	{ name: 'Jellyfin', href: '/configuration/sources/jellyfin', icon: 'jellyfin' },
	{ name: 'JRiver', href: '/configuration/sources/jriver' },
	{ name: 'Kodi', href: '/configuration/sources/kodi', icon: 'kodi' },
	{ name: 'Koito', href: '/configuration/sources/koito-source', icon: 'koito' },
	{ name: 'Last.fm', href: '/configuration/sources/lastfm-source', icon: 'last-fm' },
	{ name: 'Last.fm (Endpoint)', href: '/configuration/sources/lastfm-endpoint', icon: 'last-fm' },
	{ name: 'Libre.fm', href: '/configuration/sources/librefm-source' },
	{ name: 'ListenBrainz', href: '/configuration/sources/listenbrainz-source', icon: 'listenbrainz' },
	{ name: 'ListenBrainz (Endpoint)', href: '/configuration/sources/listenbrainz-endpoint', icon: 'listenbrainz' },
	{ name: 'Maloja', href: '/configuration/sources/maloja', icon: 'maloja' },
	{ name: 'Mixcloud', href: '/configuration/sources/mixcloud', icon: 'mixcloud' },
	{ name: 'Mopidy', href: '/configuration/sources/mopidy' },
	{ name: 'MPD', href: '/configuration/sources/mpd', note: 'Music Player Daemon' },
	{ name: 'MPRIS', href: '/configuration/sources/mpris', note: 'Linux Desktop' },
	{ name: 'Musikcube', href: '/configuration/sources/musikcube' },
	{ name: 'Music Assistant', href: '/configuration/sources/listenbrainz-endpoint#setup-for-popular-apps', icon: 'music-assistant', note: 'ListenBrainz (Endpoint)' },
	{ name: 'Navidrome', href: '/configuration/sources/listenbrainz-endpoint#setup-for-popular-apps', icon: 'navidrome', note: 'ListenBrainz (Endpoint)' },
	{ name: 'Plex', href: '/configuration/sources/plex', icon: 'plex' },
	{ name: 'Rocksky', href: '/configuration/sources/rocksky-source', icon: 'rocksky' },
	{ name: 'Sonos', href: '/configuration/sources/sonos' },
	{ name: 'Spotify', href: '/configuration/sources/spotify', icon: 'spotify' },
	{ name: 'Subsonic', href: '/configuration/sources/subsonic', icon: 'subsonic', note: 'Navidrome, Gonic...' },
	{ name: 'teal.fm', href: '/configuration/sources/tealfm-source' },
	{ name: 'TIDAL Hi-Fi', href: '/configuration/sources/listenbrainz-endpoint#setup-for-popular-apps', icon: 'tidal', note: 'ListenBrainz (Endpoint)' },
	{ name: 'WebScrobbler', href: '/configuration/sources/webscrobbler', icon: 'webscrobbler' },
	{ name: 'VLC', href: '/configuration/sources/vlc', icon: 'vlc' },
	{ name: 'Yamaha MusicCast', href: '/configuration/sources/yamaha-musiccast' },
	{ name: 'Yandex Music', href: '/configuration/sources/yandex-music', icon: 'yandex' },
	{ name: 'Youtube Music', href: '/configuration/sources/youtube-music', icon: 'youtube' },
];

export const clients: Service[] = [
	{ name: 'Discord', href: '/configuration/clients/discord', icon: 'discord', note: 'Now Playing' },
	{ name: 'Koito', href: '/configuration/clients/koito', icon: 'koito' },
	{ name: 'Last.fm', href: '/configuration/clients/lastfm', icon: 'last-fm' },
	{ name: 'Libre.fm', href: '/configuration/clients/librefm' },
	{ name: 'ListenBrainz', href: '/configuration/clients/listenbrainz', icon: 'listenbrainz' },
	{ name: 'Maloja', href: '/configuration/clients/maloja', icon: 'maloja' },
	{ name: 'Rocksky', href: '/configuration/clients/rocksky', icon: 'rocksky' },
	{ name: 'teal.fm', href: '/configuration/clients/tealfm' },
	{ name: 'Tuneshine', href: '/configuration/clients/tuneshine', note: 'Now Playing' },
];
