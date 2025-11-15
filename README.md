# GoodMove Logistics Backend with Stripe

Complete backend for GoodMove Logistics Calculator with Stripe subscription integration.

## Features
- User Authentication & Registration
- Stripe Subscription Management
- Load Calculation & Storage
- Reminder System
- Admin Panel
- Referral System

## Deployment on Render.com

1. Connect this repository to Render.com
2. Add environment variables:
   - `STRIPE_SECRET_KEY` - Your Stripe secret key
   - `JWT_SECRET` - Your JWT secret
   - `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret

3. Auto-deploy will happen
4. Your backend will be live!

## Stripe Configuration
- Publishable Key: `pk_live_51S7BjuRwI7AZXoqH478vSDoEoSn8TAuPRs1cKrcGAoeFc6mdj7osiGHZB1jr6d6DokzHsMccLdMX4RFWYPK98S1q00x6VdN4ue`
- Pre-configured subscription plans with Stripe Price IDs

## API Endpoints
- `POST /api/register` - User registration
- `POST /api/login` - User login
- `POST /api/create-subscription` - Create Stripe subscription
- `GET /api/subscription-status` - Check subscription status
- `POST /api/loads/save` - Save load calculation
- `GET /api/stripe-key` - Get Stripe publishable key