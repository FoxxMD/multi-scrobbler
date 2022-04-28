Tracks played on [Plex](https://plex.tv/) can be scrobbled either by:
 * A [Tautulli](https://tautulli.com/) notification agent with a webhook.
 * Using Plex [Webhooks](https://support.plex.tv/articles/115002267687-webhooks) (restricted to Plex Pass users)

# Using Tautulli

## Create a new Notification Agent

* Navigate to the **Notification Agents** page in **Settings**
* Click **Add a new notification agent**
* Select **Webhook**

## Configure the Agent

The below sections correspond with the tabs available in the notification agent configuration popup.

### Configuration
* Webhook URL -- `http://localhost:9078/tautulli` (substitute your domain if different than the default)
* Webhook Method -- POST

### Triggers

Select **Watched**

### Conditions

Refer to [Tautulli's documentation](https://github.com/Tautulli/Tautulli-Wiki/wiki/Custom-Notification-Conditions) if you need help here. It may be a good idea to restrict notifications to only one library (if you have a Music library, for instance)

**This app will only scrobble an item if `media_type` is a "track", which is the default for all music.**

### Data

Expand the **Watched** dropdown and add the following code block to the **JSON Data** text field:

```
{
"artist_name": "{artist_name}",
"track_name": "{track_name}",
"track_artist": "{track_artist}",
"album_name": "{album_name}",
"media_type": "{media_type}",
"title":  "{title}",
"duration": "{duration_sec}",
"username": "{username}"
}
```

**Click the Save button to finish.**

Your agent is now configured and ready to scrobble.

# Using Plex Webhooks

* Navigate to your **Account/Settings** and find the **Webhooks** page
* Click **Add Webhook**
* URL -- `http://localhost:9078/plex` (substitute your domain if different than the default)
* **Save Changes**

Plex is now configured to scrobble.
