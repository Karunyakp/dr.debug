<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/bb0473ca-5a12-4120-a5b9-67571bb03286

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to Vercel

Run `vercel` to create a preview deployment, or `vercel --prod` for production. Vercel serves the Vite build and routes the Express API and live voice WebSocket through a Node.js function.

Configure these environment variables in the Vercel project settings:

- `GEMINI_API_KEY` for server-side AI features.
- `GOOGLE_MAPS_API_KEY` for Google Maps; it is sent to the browser at runtime, so restrict this key to the deployed site’s domain.
