"use strict";(self.webpackChunkmy_website=self.webpackChunkmy_website||[]).push([[288],{4137:(e,t,n)=>{n.d(t,{Zo:()=>c,kt:()=>m});var r=n(7294);function l(e,t,n){return t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function o(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);t&&(r=r.filter((function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable}))),n.push.apply(n,r)}return n}function i(e){for(var t=1;t<arguments.length;t++){var n=null!=arguments[t]?arguments[t]:{};t%2?o(Object(n),!0).forEach((function(t){l(e,t,n[t])})):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):o(Object(n)).forEach((function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))}))}return e}function a(e,t){if(null==e)return{};var n,r,l=function(e,t){if(null==e)return{};var n,r,l={},o=Object.keys(e);for(r=0;r<o.length;r++)n=o[r],t.indexOf(n)>=0||(l[n]=e[n]);return l}(e,t);if(Object.getOwnPropertySymbols){var o=Object.getOwnPropertySymbols(e);for(r=0;r<o.length;r++)n=o[r],t.indexOf(n)>=0||Object.prototype.propertyIsEnumerable.call(e,n)&&(l[n]=e[n])}return l}var s=r.createContext({}),u=function(e){var t=r.useContext(s),n=t;return e&&(n="function"==typeof e?e(t):i(i({},t),e)),n},c=function(e){var t=u(e.components);return r.createElement(s.Provider,{value:t},e.children)},p="mdxType",d={inlineCode:"code",wrapper:function(e){var t=e.children;return r.createElement(r.Fragment,{},t)}},h=r.forwardRef((function(e,t){var n=e.components,l=e.mdxType,o=e.originalType,s=e.parentName,c=a(e,["components","mdxType","originalType","parentName"]),p=u(n),h=l,m=p["".concat(s,".").concat(h)]||p[h]||d[h]||o;return n?r.createElement(m,i(i({ref:t},c),{},{components:n})):r.createElement(m,i({ref:t},c))}));function m(e,t){var n=arguments,l=t&&t.mdxType;if("string"==typeof e||l){var o=n.length,i=new Array(o);i[0]=h;var a={};for(var s in t)hasOwnProperty.call(t,s)&&(a[s]=t[s]);a.originalType=e,a[p]="string"==typeof e?e:l,i[1]=a;for(var u=2;u<o;u++)i[u]=n[u];return r.createElement.apply(null,i)}return r.createElement.apply(null,n)}h.displayName="MDXCreateElement"},7701:(e,t,n)=>{n.r(t),n.d(t,{assets:()=>s,contentTitle:()=>i,default:()=>d,frontMatter:()=>o,metadata:()=>a,toc:()=>u});var r=n(7462),l=(n(7294),n(4137));const o={},i=void 0,a={unversionedId:"FAQ",id:"FAQ",title:"FAQ",description:"* Connection Issues",source:"@site/docs/FAQ.md",sourceDirName:".",slug:"/FAQ",permalink:"/multi-scrobbler/docs/FAQ",draft:!1,editUrl:"https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/docs/FAQ.md",tags:[],version:"current",frontMatter:{},sidebar:"tutorialSidebar",previous:{title:"Kitchen Sink",permalink:"/multi-scrobbler/docs/configuration/kitchensink"}},s={},u=[{value:"Plex/Tautulli/Jellyfin don&#39;t connect",id:"plextautullijellyfin-dont-connect",level:2},{value:"Troubleshooting",id:"troubleshooting",level:3},{value:"Turn on Debug Logging",id:"turn-on-debug-logging",level:4},{value:"Check Host name and URL",id:"check-host-name-and-url",level:4},{value:"Check Firewall and Port Forwarding",id:"check-firewall-and-port-forwarding",level:4},{value:"Check Source Service Logs",id:"check-source-service-logs",level:4},{value:"Plex",id:"plex",level:5},{value:"Tautulli",id:"tautulli",level:5},{value:"Jellyfin",id:"jellyfin",level:5},{value:"Jellyfin has warnings about undefined or missing data",id:"jellyfin-has-warnings-about-undefined-or-missing-data",level:2},{value:"Spotify/Deezer/LastFM won&#39;t authenticate",id:"spotifydeezerlastfm-wont-authenticate",level:2},{value:"Config could not be parsed",id:"config-could-not-be-parsed",level:2},{value:"Last.fm does not scrobble tracks with multiple artists correctly",id:"lastfm-does-not-scrobble-tracks-with-multiple-artists-correctly",level:2},{value:"Jellyfin does not scrobble tracks with multiple artists correctly",id:"jellyfin-does-not-scrobble-tracks-with-multiple-artists-correctly",level:2}],c={toc:u},p="wrapper";function d(e){let{components:t,...n}=e;return(0,l.kt)(p,(0,r.Z)({},c,n,{components:t,mdxType:"MDXLayout"}),(0,l.kt)("ul",null,(0,l.kt)("li",{parentName:"ul"},(0,l.kt)("a",{parentName:"li",href:"#connection-issues"},"Connection Issues"),(0,l.kt)("ul",{parentName:"li"},(0,l.kt)("li",{parentName:"ul"},(0,l.kt)("a",{parentName:"li",href:"#plextautullijellyfin-dont-connect"},"Plex/Tautulli/Jellyfin don't connect")),(0,l.kt)("li",{parentName:"ul"},(0,l.kt)("a",{parentName:"li",href:"#jellyfin-has-warnings-about-undefined-or-missing-data"},"Jellyfin has warnings about undefined or missing data")),(0,l.kt)("li",{parentName:"ul"},(0,l.kt)("a",{parentName:"li",href:"#spotifydeezerlastfm-wont-authenticate"},"Spotify/Deezer/LastFM won't authenticate")))),(0,l.kt)("li",{parentName:"ul"},(0,l.kt)("a",{parentName:"li",href:"#configuration-issues"},"Configuration Issues"),(0,l.kt)("ul",{parentName:"li"},(0,l.kt)("li",{parentName:"ul"},(0,l.kt)("a",{parentName:"li",href:"#config-could-not-be-parsed"},"Config could not be parsed")))),(0,l.kt)("li",{parentName:"ul"},(0,l.kt)("a",{parentName:"li",href:"#scrobbling-issues"},"Scrobbling Issues"),(0,l.kt)("ul",{parentName:"li"},(0,l.kt)("li",{parentName:"ul"},(0,l.kt)("a",{parentName:"li",href:"#lastfm-does-not-scrobble-tracks-with-multiple-artists-correctly"},"Last.fm does not scrobble tracks with multiple artists correctly")),(0,l.kt)("li",{parentName:"ul"},(0,l.kt)("a",{parentName:"li",href:"#jellyfin-does-not-scrobble-tracks-with-multiple-artists-correctly"},"Jellyfin does not scrobble tracks with multiple artists correctly"))))),(0,l.kt)("h1",{id:"connection-issues"},"Connection Issues"),(0,l.kt)("h2",{id:"plextautullijellyfin-dont-connect"},"Plex/Tautulli/Jellyfin don't connect"),(0,l.kt)("p",null,"These three ",(0,l.kt)("a",{parentName:"p",href:"/#source"},"sources")," are ",(0,l.kt)("strong",{parentName:"p"},"ingress-based")," which means that multi-scrobbler waits for the Plex/Tautulli/Jellyfin server to contact multi-scrobbler, as opposed to multi-scrobbler contacting the server."),(0,l.kt)("p",null,"multi-scrobbler will log information about any server that connects to it for these three services. In the logs it looks something like this:"),(0,l.kt)("pre",null,(0,l.kt)("code",{parentName:"pre"},"2023-02-22T10:55:56-05:00 info   : [Ingress - Plex  ] Received request from a new remote address: ::ffff:192.168.0.140 (UA: PlexMediaServer/1.24.5.5173-8dcc73a59)\n2023-02-22T10:55:56-05:00 info   : [Ingress - Plex  ] ::ffff:192.168.0.140 (UA: PlexMediaServer/1.24.5.5173-8dcc73a59) Received valid data from server examplePlex for the first time.\n2023-02-22T10:55:56-05:00 warn   : [Plex Request    ] Received valid Plex webhook payload but no Plex sources are configured\n")),(0,l.kt)("p",null,"It also logs if a server tries to connect to a URL that it does not recognize:"),(0,l.kt)("pre",null,(0,l.kt)("code",{parentName:"pre"},"2023-02-22T11:16:12-05:00 debug  : [App             ] Server received POST request from ::ffff:192.168.0.140 (UA: PlexMediaServer/1.24.5.5173-8dcc73a59) to unknown route: /plkex\n")),(0,l.kt)("p",null,(0,l.kt)("strong",{parentName:"p"},"So, if you do not see either of these in your logs then Plex/Tautulli/Jellyfin is not able to connect to your multi-scrobbler instance at all.")),(0,l.kt)("p",null,"This is not something multi-scrobbler can fix and means you have an issue in your network."),(0,l.kt)("h3",{id:"troubleshooting"},"Troubleshooting"),(0,l.kt)("p",null,"Check or try all these steps before submitting an issue:"),(0,l.kt)("h4",{id:"turn-on-debug-logging"},"Turn on Debug Logging"),(0,l.kt)("p",null,"First, turn on ",(0,l.kt)("strong",{parentName:"p"},"debug")," logging for multi-scrobbler by setting the environmental variable ",(0,l.kt)("inlineCode",{parentName:"p"},"LOG_LEVEL=debug"),":"),(0,l.kt)("ul",null,(0,l.kt)("li",{parentName:"ul"},"using node ",(0,l.kt)("inlineCode",{parentName:"li"},"LOG_LEVEL=debug ... node src/index.js")),(0,l.kt)("li",{parentName:"ul"},"using docker ",(0,l.kt)("inlineCode",{parentName:"li"},"docker run -e LOG_LEVEL=debug ... foxxmd/multi-scrobbler"))),(0,l.kt)("p",null,"Check the output for any additional information."),(0,l.kt)("h4",{id:"check-host-name-and-url"},"Check Host name and URL"),(0,l.kt)("p",null,"The URLs examples in the ",(0,l.kt)("a",{parentName:"p",href:"/multi-scrobbler/docs/configuration/"},"configuration")," documentation assume you are running Plex/Tautulli/Jellyfin on the same server as multi-scrobbler. If these are not the same machine then you need to determine the IP address or domain name that multi-scrobbler is reachable at and use that instead of ",(0,l.kt)("inlineCode",{parentName:"p"},"localhost")," when configuring these sources. ",(0,l.kt)("strong",{parentName:"p"},"This is likely the same host name that you would use to access the web interface for multi-scrobbler.")),(0,l.kt)("p",null,"EX ",(0,l.kt)("inlineCode",{parentName:"p"},"http://localhost:9078/plex")," -> ",(0,l.kt)("inlineCode",{parentName:"p"},"http://192.168.0.140:9078/plex")),(0,l.kt)("h4",{id:"check-firewall-and-port-forwarding"},"Check Firewall and Port Forwarding"),(0,l.kt)("p",null,"If the machine multi-scrobbler is running on has a firewall ensure that port ",(0,l.kt)("strong",{parentName:"p"},"9078")," is open. Or if it is in another network entirely make sure your router is forwarding this port and it is open to the correct machine."),(0,l.kt)("h4",{id:"check-source-service-logs"},"Check Source Service Logs"),(0,l.kt)("p",null,"Plex/Tautulli/Jellyfin all have logs that will log if they cannot connect to multi-scrobbler. Check these for further information."),(0,l.kt)("h5",{id:"plex"},"Plex"),(0,l.kt)("p",null,"Settings -> Manage -> Console"),(0,l.kt)("h5",{id:"tautulli"},"Tautulli"),(0,l.kt)("p",null,"Check the command-line output of the application or docker logs."),(0,l.kt)("h5",{id:"jellyfin"},"Jellyfin"),(0,l.kt)("p",null,"Administration -> Dashboard -> Advanced -> Logs"),(0,l.kt)("h2",{id:"jellyfin-has-warnings-about-undefined-or-missing-data"},"Jellyfin has warnings about undefined or missing data"),(0,l.kt)("p",null,"Make sure you have "),(0,l.kt)("ul",null,(0,l.kt)("li",{parentName:"ul"},(0,l.kt)("a",{parentName:"li",href:"/multi-scrobbler/docs/configuration/#jellyfin"},"Configured the webhook plugin correctly"),(0,l.kt)("ul",{parentName:"li"},(0,l.kt)("li",{parentName:"ul"},"Checked the ",(0,l.kt)("strong",{parentName:"li"},"Send All Properties(ignores template)")," option in the webhook settings and ",(0,l.kt)("strong",{parentName:"li"},"Saved"))))),(0,l.kt)("p",null,"multi-scrobbler is known to work on Jellyfin ",(0,l.kt)("inlineCode",{parentName:"p"},"10.8.9")," with Webhook version ",(0,l.kt)("inlineCode",{parentName:"p"},"11.0.0.0"),"."),(0,l.kt)("p",null,"You can verify the payload sent from the webhook by modifying your jellyfin configuration to include ",(0,l.kt)("inlineCode",{parentName:"p"},"logPayload: true")," which will output the raw payload to DEBUG level logging:"),(0,l.kt)("pre",null,(0,l.kt)("code",{parentName:"pre",className:"language-json"},'[\n  {\n    "name": "MyJellyfin",\n    "clients": [],\n    "data": {\n      "users": ["FoxxMD"],\n      "options": {\n        "logPayload": true\n      }\n    }\n  }\n]\n')),(0,l.kt)("p",null,"If your issue persists and you open an Issue for it please include the raw payload logs in your report."),(0,l.kt)("h2",{id:"spotifydeezerlastfm-wont-authenticate"},"Spotify/Deezer/LastFM won't authenticate"),(0,l.kt)("p",null,"Ensure any ",(0,l.kt)("strong",{parentName:"p"},"client id")," or ",(0,l.kt)("strong",{parentName:"p"},"secrets")," are correct in your configuration."),(0,l.kt)("p",null,"The callback/redirect URL for these services must be:"),(0,l.kt)("ul",null,(0,l.kt)("li",{parentName:"ul"},"the same address you would use to access the multi-scrobbler web interface",(0,l.kt)("ul",{parentName:"li"},(0,l.kt)("li",{parentName:"ul"},"the web-interface must be accessible from the browser you are completing authentication from.")))),(0,l.kt)("p",null,"If multi-scrobbler is not running on the same machine your browser is on then the default/example addresses (",(0,l.kt)("inlineCode",{parentName:"p"},"http://localhost..."),") ",(0,l.kt)("strong",{parentName:"p"},"will not work.")," You must determine the address you can reach the web interface at (such as ",(0,l.kt)("inlineCode",{parentName:"p"},"http://192.168.0.140:9078"),") then use that in place of ",(0,l.kt)("inlineCode",{parentName:"p"},"localhost")," in the callback URLs."),(0,l.kt)("p",null,"EX ",(0,l.kt)("inlineCode",{parentName:"p"},"http://localhost:9078/lastfm/callback")," -> ",(0,l.kt)("inlineCode",{parentName:"p"},"http://192.168.0.220:9078/lastfm/callback")),(0,l.kt)("h1",{id:"configuration-issues"},"Configuration Issues"),(0,l.kt)("h2",{id:"config-could-not-be-parsed"},"Config could not be parsed"),(0,l.kt)("p",null,"If you see something like this in your logs:"),(0,l.kt)("pre",null,(0,l.kt)("code",{parentName:"pre"},"2023-02-19T10:05:42-06:00 warn   : [App] App config file exists but could not be parsed!\n2023-02-19T10:05:42-06:00 error  : [App] Exited with uncaught error\n2023-02-19T10:05:42-06:00 error  : [App] Error: config.json could not be parsed\n")),(0,l.kt)("p",null,"It means the JSON in your configuration file is not valid. Copy and paste your configuration into a site like ",(0,l.kt)("a",{parentName:"p",href:"https://jsonlint.com/"},"JSONLint")," to find out where errors you have and fix them."),(0,l.kt)("h1",{id:"scrobbling-issues"},"Scrobbling Issues"),(0,l.kt)("h2",{id:"lastfm-does-not-scrobble-tracks-with-multiple-artists-correctly"},"Last.fm does not scrobble tracks with multiple artists correctly"),(0,l.kt)("p",null,"This is a limitation of the ",(0,l.kt)("a",{parentName:"p",href:"https://www.last.fm/api/show/track.scrobble"},"Last.fm API")," where the ",(0,l.kt)("strong",{parentName:"p"},"artist"),' field is only one string and Last.fm does not recognize (play well) with "combined" artists.'),(0,l.kt)("p",null,"Multi-scrobbler works the same was the official Spotify-Last.fm integration works -- it only scrobbles the ",(0,l.kt)("strong",{parentName:"p"},"first")," artist on a multi-artist track."),(0,l.kt)("h2",{id:"jellyfin-does-not-scrobble-tracks-with-multiple-artists-correctly"},"Jellyfin does not scrobble tracks with multiple artists correctly"),(0,l.kt)("p",null,"This is a limitation caused by the ",(0,l.kt)("a",{parentName:"p",href:"https://github.com/FoxxMD/multi-scrobbler/issues/70#issuecomment-1443804712"},"Jellyfin webhook plugin")," only sending the first artist to multi-scrobbler. This issues needs to be ",(0,l.kt)("a",{parentName:"p",href:"https://github.com/jellyfin/jellyfin-plugin-webhook/issues/166"},"fixed upstream on the Jellyfin webhook repository.")))}d.isMDXComponent=!0}}]);