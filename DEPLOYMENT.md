# Arc Finance - Deployment Guide

This guide walks you through deploying Arc Finance, an AI-powered cash flow predictor, from development to production.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Environment Variables](#environment-variables)
- [Database Setup (Supabase)](#database-setup-supabase)
- [External Service Configuration](#external-service-configuration)
- [Deployment Options](#deployment-options)
- [Post-Deployment Checklist](#post-deployment-checklist)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **Git** - [Download here](https://git-scm.com/)
- **Supabase Account** - [Sign up here](https://supabase.com/)
- **Plaid Account** - [Sign up here](https://dashboard.plaid.com/)
- **Google AI Studio Account** - [Get API key here](https://aistudio.google.com/app/apikey)
- **Resend Account** (for email) - [Sign up here](https://resend.com/)

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/LucasAust/forecaster2.git
cd forecaster2
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your actual values (see [Environment Variables](#environment-variables) section below).

### 4. Set Up Database

Follow the [Database Setup](#database-setup-supabase) section to configure Supabase.

### 5. Run the Development Server

```bash
npm run dev
```

Your app will be available at `http://localhost:3000`.

## Environment Variables

Arc requires several environment variables for full functionality. Here's what each one does:

### Application Settings

```env
NEXT_PUBLIC_BASE_URL=http://localhost:3000  # Your app's URL (production URL when deployed)
NODE_ENV=development  # Set to 'production' for production builds
```

### Supabase (Database & Authentication)

Get these from your Supabase project dashboard → Settings → API:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key  # For admin operations
```

### Plaid (Bank Connections)

Get these from your Plaid dashboard → Team Settings → Keys:

```env
PLAID_CLIENT_ID=your-plaid-client-id
PLAID_SECRET=your-plaid-secret-key
PLAID_ENV=sandbox  # Use 'development' or 'production' for live data
```

### Google Gemini AI (Financial Insights)

Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey):

```env
GEMINI_API_KEY=your-gemini-api-key
```

### Email (via Resend)

Get these from your Resend dashboard:

```env
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM="Arc Finance <noreply@yourdomain.com>"  # Must be verified in Resend
```

### Security

Generate a random secret key (32+ characters) for MFA session security:

```env
MFA_COOKIE_SECRET=your-super-secret-mfa-cookie-signing-key-change-this
```

### Advanced Tuning (Optional)

These parameters control the AI forecasting algorithm. Leave them unset to use defaults:

```env
# Check density parameters
ARC_CAL_CHECK_DENSE_HIGH=0.7
ARC_CAL_CHECK_DENSE_LOW=0.3

# Cashout prediction parameters  
ARC_CAL_CASHOUT_EXPECTED_MULT=1.0
ARC_CAL_CASHOUT_STALE_MULT=0.8
ARC_CAL_CASHOUT_CAP_MAX=5000
ARC_CAL_CASHOUT_CAP_SLOPE=0.1

# ... (see .env.example for full list)
```

## Database Setup (Supabase)

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com/) and create a new project
2. Choose your organization and set a database password
3. Wait for the project to be created (~2 minutes)

### 2. Run the Database Schema

1. In your Supabase project, go to **SQL Editor**
2. Copy the contents of `db/schema.sql`
3. Paste it into a new SQL query and run it
4. This will create all necessary tables and Row Level Security (RLS) policies

### 3. Configure Authentication

Arc uses Supabase Auth with email/password + optional MFA:

1. Go to **Authentication** → **Settings** in your Supabase dashboard
2. Configure your **Site URL** to match your `NEXT_PUBLIC_BASE_URL`
3. Add your domain to **Redirect URLs** (for production)
4. Optionally enable additional providers (Google, GitHub, etc.)

### 4. Verify Tables

Check that these tables were created:
- `plaid_items` - Stores Plaid access tokens and sync state
- `transactions` - Stores financial transactions
- `user_settings` - User preferences and budgets
- `forecasts` - Cached AI predictions
- `ai_suggestions` - Financial recommendations
- `mfa_email_codes` - Email MFA verification codes

## External Service Configuration

### Plaid Setup

1. **Create a Plaid account** at [dashboard.plaid.com](https://dashboard.plaid.com/)
2. **Get your keys** from Team Settings → Keys
3. **Start in Sandbox mode** (`PLAID_ENV=sandbox`) for testing
4. **Request production access** when ready to go live
5. **Configure webhooks** (optional but recommended for real-time updates)

**Plaid Environment Guide:**
- `sandbox` - Fake data for testing
- `development` - Real bank connections, limited to 100 Items
- `production` - Full production access (requires approval)

### Google Gemini AI Setup

1. **Get an API key** from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. **Enable billing** if you exceed free tier limits
3. **Monitor usage** in the Google Cloud Console

**Note**: Arc can run without Gemini (with reduced AI features) if the API key is not set.

### Resend Email Setup

1. **Create a Resend account** at [resend.com](https://resend.com/)
2. **Add and verify your domain** in DNS settings
3. **Create an API key** with send permissions
4. **Set your FROM address** to use your verified domain

**For testing**: You can use Resend's test domain, but emails may be flagged as spam.

## Deployment Options

Arc can be deployed on various platforms. Here are the most common options:

### Option 1: Railway (Recommended)

Railway provides easy deployment with automatic builds and environment management.

1. **Connect your repository** to Railway
2. **Set environment variables** in the Railway dashboard
3. **Deploy automatically** on every git push

**Pros**: Simple setup, automatic HTTPS, good for MVPs
**Cons**: Can be more expensive at scale

### Option 2: Vercel

Vercel is optimized for Next.js applications and offers excellent performance.

1. **Install Vercel CLI**: `npm install -g vercel`
2. **Deploy**: `vercel --prod`
3. **Set environment variables** in Vercel dashboard

**Pros**: Great Next.js integration, fast CDN, generous free tier
**Cons**: Serverless functions have execution time limits

### Option 3: Docker + Any Host

For more control, use Docker to containerize the application.

1. **Build the Docker image**:
   ```bash
   docker build -t arc-finance .
   ```

2. **Run with environment variables**:
   ```bash
   docker run -d \
     -p 3000:3000 \
     -e NEXT_PUBLIC_BASE_URL=https://yourdomain.com \
     -e SUPABASE_URL=... \
     # ... (all other env vars)
     arc-finance
   ```

**Pros**: Full control, can run anywhere, easier to debug
**Cons**: More setup required, need to manage infrastructure

### Environment-Specific Configuration

#### Production Considerations

- **Set `NODE_ENV=production`**
- **Use production Plaid environment** (`PLAID_ENV=production`)
- **Enable HTTPS** and set correct `NEXT_PUBLIC_BASE_URL`
- **Use strong secrets** and rotate them regularly
- **Monitor error logs** and set up alerting

#### Staging Environment

- Use `PLAID_ENV=development` for real bank data with limits
- Use a separate Supabase project for isolation
- Set `NEXT_PUBLIC_BASE_URL` to your staging domain

## Post-Deployment Checklist

After deploying, verify everything works:

### ✅ Basic Functionality
- [ ] App loads without errors
- [ ] User registration works
- [ ] Email verification works (check MFA codes)
- [ ] Health check endpoint returns 200: `GET /api/health`

### ✅ Plaid Integration
- [ ] Link flow works (can connect a test bank)
- [ ] Transactions sync properly
- [ ] Can disconnect accounts

### ✅ AI Features
- [ ] Forecasts generate without errors
- [ ] Suggestions appear on dashboard
- [ ] Chat functionality works

### ✅ Security
- [ ] HTTPS is enabled and working
- [ ] Authentication redirects work
- [ ] RLS policies prevent data leaks (test with different users)
- [ ] Environment variables are not exposed to client

### ✅ Performance
- [ ] Page load times are acceptable (&lt;3s)
- [ ] Database queries are optimized
- [ ] No memory leaks in long-running processes

## Monitoring & Maintenance

### Health Check

Arc includes a health check endpoint at `/api/health` that returns:

```json
{
  "status": "ok",
  "version": "0.1.0",
  "timestamp": "2024-03-17T12:46:00.000Z",
  "uptime": "2h 15m 30s",
  "environment": "production"
}
```

Use this for:
- Load balancer health checks
- Uptime monitoring services
- CI/CD pipeline verification

### Error Monitoring

Recommended tools:
- **Sentry** - For error tracking and performance monitoring
- **LogRocket** - For session replay and debugging
- **Vercel Analytics** - For web vitals (if using Vercel)

### Database Maintenance

- **Monitor Supabase usage** in the dashboard
- **Set up database backups** (automatic in Supabase)
- **Review slow queries** and add indexes as needed
- **Clean up old data** periodically (forecasts, suggestions)

### Cost Optimization

- **Monitor API usage**: Plaid, Gemini, and Resend have usage-based pricing
- **Optimize database queries**: Use EXPLAIN to analyze performance
- **Cache frequently accessed data**: Consider Redis for session data
- **Review logs**: Remove verbose logging in production

## Troubleshooting

### Common Issues

#### "Plaid credentials not set" Error

**Cause**: Missing or incorrect Plaid environment variables
**Solution**: Check `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV` in your environment

#### Build Failures

**Cause**: Environment variables not available during build
**Solution**: Ensure all required env vars are set in your deployment platform

#### Database Connection Errors

**Cause**: Incorrect Supabase credentials or network issues
**Solution**: Verify `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

#### Email/MFA Not Working

**Cause**: Resend configuration issues
**Solution**: 
1. Verify domain ownership in Resend dashboard
2. Check `RESEND_API_KEY` and `EMAIL_FROM` settings
3. Ensure `MFA_COOKIE_SECRET` is set

#### Forecast Generation Fails

**Cause**: Missing Gemini API key or quota exceeded
**Solution**:
1. Check `GEMINI_API_KEY` is valid
2. Monitor usage in Google AI Studio
3. The app will fall back to deterministic forecasts if Gemini fails

### Getting Help

- **Check the logs**: Most issues show up in server logs
- **Use health endpoint**: `/api/health` shows basic system status
- **Test environment variables**: Ensure all required vars are set
- **Database integrity**: Run the schema again if tables are missing
- **Community support**: File issues on GitHub for bugs

### Performance Issues

If the app is slow:

1. **Check database performance** in Supabase dashboard
2. **Monitor API response times** (Plaid, Gemini can be slow)
3. **Optimize database queries** with proper indexes
4. **Consider caching** for frequently accessed data
5. **Profile the application** using browser dev tools

---

## Next Steps

After successful deployment:

1. **Monitor usage** and performance metrics
2. **Gather user feedback** to prioritize improvements
3. **Plan for scaling** as your user base grows
4. **Keep dependencies updated** for security and performance
5. **Consider additional features** like investment tracking or bill reminders

Happy deploying! 🚀