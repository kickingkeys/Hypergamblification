# Project Requirements & Setup Checklist

## 🔑 API Keys & Accounts Needed

### 1. OpenAI Account
**What:** LLM for matching OCR text to Kalshi markets
**Sign up:** https://platform.openai.com/signup
**Setup steps:**
- [ ] Create OpenAI account
- [ ] Add payment method (credit card required)
- [ ] Generate API key: https://platform.openai.com/api-keys
- [ ] Set usage limits (recommended: $10/month to start)
- [ ] Save key securely (never commit to git!)

**Cost:** ~$0.00025 per match (~$2-5/month for testing)
**Model:** `gpt-4o-mini` (cheapest, fastest)

---

### 2. Kalshi Account
**What:** Prediction markets API for fetching betting markets
**Sign up:** https://kalshi.com/sign-up
**Setup steps:**
- [ ] Create Kalshi account
- [ ] Verify email/identity (required for API access)
- [ ] Generate API credentials:
  - Go to Account Settings → API
  - Create API Key ID
  - Download private key file (.pem)
- [ ] Save both API Key ID and private key file securely

**Cost:** Free API access (no trading required for data fetching)
**Documentation:** https://docs.kalshi.com

---

### 3. OCR Solution (Choose One)

#### Option A: Tesseract.js (Recommended for MVP)
**What:** Free, open-source OCR that runs in browser
**Setup steps:**
- [ ] No account needed
- [ ] Install via npm: `npm install tesseract.js`

**Pros:**
- ✅ Free
- ✅ No API key
- ✅ Works offline
- ✅ Privacy (no data leaves browser)

**Cons:**
- ⚠️ Lower accuracy (~85%)
- ⚠️ Slower (1-3 seconds)
- ⚠️ Uses client CPU

---

#### Option B: Google Cloud Vision API (Better accuracy)
**What:** Google's OCR service
**Sign up:** https://cloud.google.com/vision
**Setup steps:**
- [ ] Create Google Cloud account
- [ ] Enable Vision API
- [ ] Create service account
- [ ] Download credentials JSON
- [ ] Enable billing (required even for free tier)

**Cost:**
- First 1,000 requests/month: FREE
- After: $1.50 per 1,000 requests
- Realistic usage: $0-3/month

**Pros:**
- ✅ High accuracy (~98%)
- ✅ Fast (200-500ms)
- ✅ Handles complex layouts

**Cons:**
- ⚠️ Requires API key
- ⚠️ Data sent to Google
- ⚠️ Needs internet

---

## 🛠️ Development Tools

### Required

1. **Node.js & npm**
   - [ ] Install Node.js 18+ (https://nodejs.org)
   - [ ] Verify: `node --version` and `npm --version`

2. **Git**
   - [ ] Install Git (https://git-scm.com)
   - [ ] Configure: `git config --global user.name "Your Name"`

3. **Code Editor**
   - [ ] VS Code (recommended) or your preferred editor
   - [ ] Install extensions:
     - ESLint
     - Prettier
     - Chrome Debugger (for extension debugging)

4. **Chrome Browser**
   - [ ] Chrome/Chromium for extension development
   - [ ] Enable Developer Mode in `chrome://extensions`

### Optional but Helpful

5. **Webpack/Build Tools**
   - [ ] Will install via npm packages
   - [ ] Needed to bundle TypeScript SDK for browser

6. **Postman or Similar**
   - [ ] For testing Kalshi API endpoints
   - [ ] Not required but helpful for debugging

---

## 📦 NPM Packages Needed

Create `package.json` and install:

```json
{
  "dependencies": {
    "kalshi-typescript": "^latest",
    "tesseract.js": "^5.0.0",
    "openai": "^4.0.0",
    "fuse.js": "^7.0.0"
  },
  "devDependencies": {
    "webpack": "^5.90.0",
    "webpack-cli": "^5.1.0",
    "ts-loader": "^9.5.0",
    "typescript": "^5.3.0",
    "@types/chrome": "^0.0.260"
  }
}
```

**Installation:**
```bash
npm install
```

---

## 🏗️ Chrome Extension Setup

### Manifest Permissions Needed

Your `manifest.json` will need:

```json
{
  "manifest_version": 3,
  "permissions": [
    "activeTab",
    "scripting",
    "storage",
    "notifications"
  ],
  "host_permissions": [
    "https://*/*",
    "http://*/*"
  ]
}
```

**Permissions explained:**
- `activeTab` - Capture current tab's screenshot
- `scripting` - Inject content scripts if needed
- `storage` - Cache markets locally
- `notifications` - Show toast notifications
- `host_permissions` - Run on all websites

---

## 🗂️ Project Structure

```
hypergamblification/
├── src/
│   ├── background/
│   │   ├── background.ts       # Service worker
│   │   └── kalshi-client.ts    # Kalshi API wrapper
│   ├── content/
│   │   ├── content.ts          # Content script
│   │   └── toast.ts            # Toast UI component
│   ├── lib/
│   │   ├── ocr.ts              # OCR handler (Tesseract)
│   │   ├── matcher.ts          # LLM matching logic
│   │   └── cache.ts            # Market cache manager
│   └── popup/
│       ├── popup.html
│       └── popup.ts
├── dist/                        # Built extension (gitignored)
├── .env                         # API keys (gitignored!)
├── .gitignore
├── package.json
├── tsconfig.json
├── webpack.config.js
└── README.md
```

---

## 🔐 Environment Variables

Create `.env` file (DO NOT COMMIT):

```bash
# OpenAI
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx

# Kalshi
KALSHI_API_KEY_ID=xxxxxxxxxxxxx
KALSHI_PRIVATE_KEY_PATH=./kalshi-private-key.pem

# Google Cloud Vision (if using)
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json

# Optional: Backend URL (if you build one later)
BACKEND_URL=http://localhost:3000
```

**Add to `.gitignore`:**
```
.env
*.pem
*-credentials.json
```

---

## 💰 Cost Summary

### Monthly Costs (Per Active User)

| Service | Usage | Cost |
|---------|-------|------|
| **OpenAI (GPT-4o-mini)** | 1000 matches/month | $0.25 |
| **Kalshi API** | Unlimited reads | $0.00 |
| **Tesseract.js** | Unlimited | $0.00 |
| **Google Cloud Vision** (optional) | 1000 OCR/month | $0.00 (free tier) |
| **Hosting** (if needed) | N/A | $0.00 (client-side only) |

**Total: ~$0.25-1/user/month** (very cheap!)

### One-Time Setup Costs
- OpenAI minimum deposit: $5
- Kalshi: $0 (no deposit needed for API access)
- Google Cloud: $0 (free tier available)

**Total to get started: $5**

---

## 🚀 Optional: Backend Service (Future)

If you decide to build a backend later:

### Hosting Options
1. **Railway.app** - $5/month, easy deploy
2. **Render.com** - Free tier available
3. **Vercel** - Free for hobby projects
4. **AWS/GCP** - $5-10/month (more complex)

### What Backend Would Do
- Proxy OpenAI API calls (hide your key from users)
- Cache Kalshi markets centrally
- Rate limiting
- Analytics/tracking

**Not needed for MVP** - can do everything client-side initially.

---

## 📋 Division of Work Suggestions

### Person 1: Extension Infrastructure
- [ ] Set up Chrome extension skeleton
- [ ] Build screen capture functionality
- [ ] Create toast notification UI
- [ ] Handle permissions and settings

### Person 2: API Integrations
- [ ] Kalshi SDK integration
- [ ] Market caching system
- [ ] OpenAI API integration
- [ ] Matching algorithm

### Shared:
- [ ] OCR implementation (Tesseract.js)
- [ ] Testing on real websites
- [ ] Documentation
- [ ] UI/UX polish

---

## ✅ Initial Setup Checklist

**Before first coding session:**
- [ ] Both people have Node.js installed
- [ ] Git repo created and shared
- [ ] `.gitignore` set up (exclude `.env`, `*.pem`, etc.)
- [ ] OpenAI account created, API key generated
- [ ] Kalshi account created, API credentials downloaded
- [ ] Both people have credentials (or decide who hosts them)
- [ ] `package.json` created, dependencies installed
- [ ] Chrome Developer Mode enabled

**First milestone (Week 1):**
- [ ] Extension loads in Chrome
- [ ] Can capture screenshot of current tab
- [ ] Can perform OCR on screenshot (log text to console)
- [ ] Can fetch markets from Kalshi (log to console)

**Second milestone (Week 2):**
- [ ] LLM matching works (given text + markets → returns match)
- [ ] Toast notification displays on page
- [ ] Full flow works end-to-end once

---

## 🔒 Security Considerations

**Critical:**
- [ ] Never commit API keys to git
- [ ] Use `.env` for all secrets
- [ ] Add `.env` to `.gitignore` BEFORE first commit
- [ ] Don't expose keys in extension code (users can read it!)
- [ ] Consider backend proxy for production

**For Production:**
- [ ] Implement rate limiting (prevent API abuse)
- [ ] Add user consent/privacy policy
- [ ] Encrypt stored API keys
- [ ] Monitor API usage/costs

---

## 📚 Documentation Links

- **Kalshi API Docs:** https://docs.kalshi.com
- **OpenAI API Docs:** https://platform.openai.com/docs
- **Tesseract.js:** https://tesseract.projectnaptha.com/
- **Chrome Extensions:** https://developer.chrome.com/docs/extensions/
- **Webpack:** https://webpack.js.org/guides/getting-started/

---

## 🤝 Collaboration Setup

### Git Workflow
```bash
# Clone repo
git clone <repo-url>
cd hypergamblification

# Install dependencies
npm install

# Copy .env.example to .env (each person does this)
cp .env.example .env
# Then edit .env with your API keys

# Create feature branch
git checkout -b feature/screen-capture

# Work, commit, push
git add .
git commit -m "Add screen capture"
git push origin feature/screen-capture

# Create PR for review
```

### Sharing API Keys (During Development)
**Option 1:** Each person gets their own keys
- More secure
- Separate usage tracking
- Recommended

**Option 2:** Share keys via secure channel (1Password, etc.)
- Faster setup
- Shared costs
- Less secure

---

## 🎯 Ready to Start?

You now have everything you need to know! Next steps:

1. Create accounts (OpenAI, Kalshi)
2. Get API keys
3. Set up development environment
4. Divide tasks
5. Start building!

Want me to generate starter code for any of these components?
