# KillVolute Deployment

This package is ready to host on GitHub Pages as a static site.

## Pages

The app includes GitHub Pages-friendly folder routes:

- `/latest/`
- `/about/`
- `/badges/`
- `/filter/`

Each route redirects into the main app with the right view selected.

## Storage

GitHub Pages cannot save posts by itself because it only serves static files. KillVolute works immediately with browser local storage, and it can sync to a server if you provide an API endpoint.

Set the endpoint in `js/config.js`:

```js
window.KILLVOLUTE_STORAGE_URL = 'https://your-api.example.com/forum-state';
```

The endpoint should:

- return the full forum state JSON on `GET`
- accept the full forum state JSON on `PUT`

Without that endpoint, KillVolute keeps using local storage.
