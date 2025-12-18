# HA Tools - Importer Decision Dashboard

A secure, production-ready SaaS application for importers to make confident sourcing decisions. Compare supplier quotes, calculate landed costs, and choose the best option for your business.

<!-- Demo mode enabled - no login required -->

## Features

- 📊 **Decision Dashboard** - Compare all quotes and see the best option instantly
- 📦 **Product Management** - Track products and collect supplier quotes
- 💰 **Landed Cost Calculator** - Calculate true cost including all import fees
- 📝 **Quote Upload & Extract** - Upload documents or paste screenshots (Ctrl+V)
- 🔍 **Multi-SKU Support** - Handle complex quotes with multiple line items
- ✅ **Field Confidence** - See which data was found vs missing in documents
- 🚢 **Shipping Reality** - Track weight, dimensions, CBM for accurate planning

## Security Features

- ✅ **Supabase Authentication** - Secure email/password auth with JWT
- ✅ **Row Level Security (RLS)** - Users can only access their own data
- ✅ **Strong Password Requirements** - 8+ chars, uppercase, lowercase, number, special char
- ✅ **Email Verification** - Required before account activation
- ✅ **Environment Variables** - Credentials never hardcoded
- ✅ **Rate Limiting** - Built-in Supabase protection against brute force
- ✅ **HTTPS** - All traffic encrypted

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run the SQL schema (see `schema.sql`)
3. Enable Email Auth in Authentication → Providers
4. Configure URL settings in Authentication → URL Configuration

### 4. Run Development Server

```bash
npm run dev
```

### 5. Build for Production

```bash
npm run build
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

⚠️ **Never commit `.env` to git!** It's already in `.gitignore`.

## Production Checklist

Before deploying to production:

- [ ] Set strong `JWT_SECRET` in Supabase
- [ ] Enable "Confirm email" in Supabase Auth settings
- [ ] Set minimum password length to 8 in Supabase
- [ ] Configure proper Site URL for email redirects
- [ ] Enable rate limiting (default is on)
- [ ] Consider enabling MFA for extra security
- [ ] Set up proper CORS if using custom domain

## Tech Stack

- **Frontend**: React 18 + Vite
- **Styling**: Custom CSS (no framework)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Charts**: Recharts
- **Icons**: Lucide React
- **Export**: SheetJS (xlsx)

## License

MIT
