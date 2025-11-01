# Frontend Guide

## ✅ Complete!

Your XPerps platform now has a **full-featured website** built with React.

## What's Included

### Pages

1. **Landing Page** (`/`)
   - Hero section with gradient text
   - Feature cards
   - Call-to-action buttons

2. **Dashboard** (`/dashboard`)
   - Balance viewer
   - Deposit USDC interface
   - Wallet export panel
   - Real-time data from API

3. **Docs** (`/docs`)
   - Getting started guide
   - Trading commands
   - API reference
   - Security info

### Features

✅ Modern dark theme (sleek minimalist design)
✅ Fully responsive (mobile-friendly)
✅ No build step needed (uses React via CDN)
✅ Integrates with backend API automatically
✅ Ready for Railway deployment

## File Structure

```
public/
├── index.html       # Main HTML file
├── styles.css       # All styles (dark theme)
└── app.js           # React app (all components)
```

## How It Works

1. **Express serves static files** from `/public` folder
2. **React renders** the SPA (Single Page Application)
3. **API calls** go to same origin (no CORS issues)
4. **Catch-all route** serves `index.html` for client-side routing

## Local Development

```bash
# Run everything (API + workers + frontend)
npm run start:all

# Then visit:
http://localhost:3000
```

The frontend is served at the root `/`, and API endpoints are at `/api/*`.

## Deployment (Railway)

When you deploy to Railway:

1. Push to GitHub
2. Connect Railway to your repo
3. Railway will:
   - Install dependencies
   - Build TypeScript (`npm run build`)
   - Start server (`npm start`)
   - Serve frontend at your Railway URL

**That's it!** Everything works automatically.

## Customization

### Change Colors

Edit `/public/styles.css`:

```css
:root {
    --accent: #6366f1;      /* Change primary color */
    --bg: #0a0a0a;          /* Background */
    --surface: #151515;     /* Cards */
}
```

### Add Pages

Edit `/public/app.js`, add new component:

```javascript
function NewPage() {
    return <div>Your content</div>;
}

// Then add to App router:
{page === 'newpage' && <NewPage />}
```

### Modify Bot Handle

Update in your tweets examples:
- Replace `@YourBot` with your actual bot handle
- It's pulled from `TWITTER_BOT_HANDLE` in `.env`

## Tech Stack

- **React 18** (via CDN, no webpack)
- **Babel Standalone** (JSX transpilation in browser)
- **Pure CSS** (no frameworks, fully custom)
- **Express** (serves static files)

## Why This Approach?

1. **No build complexity** - No webpack, no npm build for frontend
2. **Fast iteration** - Edit files, refresh browser
3. **Single repo** - Backend + frontend together
4. **Railway ready** - Deploy as-is, everything works

## URLs

When deployed on Railway (e.g., `yourapp.railway.app`):

- `https://yourapp.railway.app/` → Landing page
- `https://yourapp.railway.app/dashboard` → Dashboard
- `https://yourapp.railway.app/docs` → Docs
- `https://yourapp.railway.app/api/*` → API endpoints
- `https://yourapp.railway.app/health` → Health check

## Mobile Support

Fully responsive:
- Stacks cards on mobile
- Hides nav on small screens
- Touch-friendly buttons
- Readable text sizes

## What's Next?

The frontend is **production-ready**. Optional enhancements:

- [ ] Add real-time position updates
- [ ] WebSocket for live balance
- [ ] Trade history table
- [ ] Chart integration (TradingView)
- [ ] Dark/light mode toggle
- [ ] Connect wallet button (for non-custodial)

But you're good to deploy **right now**! 🚀

---

**Your full-stack perps trading platform is ready.**
