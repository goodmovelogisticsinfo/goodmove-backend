const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'goodmove_secret_key_2024';

// Stripe Configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PUBLISHABLE_KEY = 'pk_live_51S7BjuRwI7AZXoqH478vSDoEoSn8TAuPRs1cKrcGAoeFc6mdj7osiGHZB1jr6d6DokzHsMccLdMX4RFWYPK98S1q00x6VdN4ue';

const stripe = new Stripe(STRIPE_SECRET_KEY);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// In-memory storage
let users = {};
let loads = {};
let reminders = {};
let referrals = {};
let subscriptions = {};

// Subscription Plans with Stripe Price IDs
const subscriptionPlans = {
    'weekly': { 
        price: 10.00, 
        duration: 7,
        stripePriceId: 'price_1SCRq2RwI7AZXoqH3Z3qCWZl',
        name: 'Weekly Plan'
    },
    'monthly': { 
        price: 99.00, 
        duration: 30,
        stripePriceId: 'price_1SCRQcRwI7AZXoqHxRHIpQqt',
        name: 'Monthly Plan'
    },
    'quarterly': { 
        price: 299.00, 
        duration: 90,
        stripePriceId: 'price_1SCRVRRwI7AZXoqHsVE2HPUk',
        name: 'Quarterly Plan'
    },
    'half_yearly': { 
        price: 599.00, 
        duration: 180,
        stripePriceId: 'price_1SCRaLRwI7AZXoqHmfqVehUp',
        name: 'Half-Yearly Plan'
    },
    'annual': { 
        price: 1199.00, 
        duration: 365,
        stripePriceId: 'price_1SCL0MRwI7AZXoqH5c8kSWSZ',
        name: 'Annual Plan'
    }
};

// Admin User (Pre-configured)
const adminUser = {
    id: 'admin-001',
    email: 'admin@goodmove.com',
    password: '$2a$10$8K1p/a0dRTlR0dS.1a0YeeR3C8Q2pZ5XkZJ5XkZJ5XkZJ5XkZJ5XkZ', // Admin@123
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    phone: '+1-000-000-0000',
    registrationDate: new Date().toISOString(),
    subscription: 'admin',
    subscriptionExpiry: new Date('2030-12-31').toISOString(),
    subscriptionPrice: 0
};

users['admin@goodmove.com'] = adminUser;

// Currency and Country Data
const currencyRates = {
    'usa': { code: 'USD', rate: 1, symbol: '$', name: 'US Dollar' },
    'canada': { code: 'CAD', rate: 1.35, symbol: 'C$', name: 'Canadian Dollar' },
    'mexico': { code: 'MXN', rate: 20.50, symbol: 'Mex$', name: 'Mexican Peso' },
    'uk': { code: 'GBP', rate: 0.79, symbol: '£', name: 'British Pound' },
    'australia': { code: 'AUD', rate: 1.52, symbol: 'A$', name: 'Australian Dollar' },
    'germany': { code: 'EUR', rate: 0.92, symbol: '€', name: 'Euro' },
    'india': { code: 'INR', rate: 83.25, symbol: '₹', name: 'Indian Rupee' }
};

const countryCosts = {
    'usa': { insurance: 15.50, maintenance: 22.75, fuelCost: 3.85, permitTax: 12.0, tollRoad: 8.5, driverCost: 200 },
    'canada': { insurance: 16.25, maintenance: 23.50, fuelCost: 4.20, permitTax: 14.0, tollRoad: 7.5, driverCost: 190 },
    'mexico': { insurance: 12.75, maintenance: 18.50, fuelCost: 3.95, permitTax: 8.0, tollRoad: 5.5, driverCost: 120 },
    'uk': { insurance: 18.25, maintenance: 25.75, fuelCost: 6.50, permitTax: 15.0, tollRoad: 12.5, driverCost: 220 },
    'australia': { insurance: 17.50, maintenance: 24.25, fuelCost: 4.75, permitTax: 13.0, tollRoad: 9.5, driverCost: 210 },
    'germany': { insurance: 19.75, maintenance: 27.25, fuelCost: 6.80, permitTax: 16.0, tollRoad: 11.5, driverCost: 230 },
    'india': { insurance: 8.50, maintenance: 12.75, fuelCost: 4.10, permitTax: 6.0, tollRoad: 3.5, driverCost: 80 }
};

// Authentication Routes (Same as before, but updated for Stripe)
app.post('/api/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password, phone, countryCode, referralCode } = req.body;

        if (!firstName || !lastName || !email || !password || !phone) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        if (users[email]) {
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userReferralCode = generateReferralCode();
        const fullPhone = countryCode ? `${countryCode} ${phone}` : phone;

        const newUser = {
            id: uuidv4(),
            firstName,
            lastName,
            email,
            password: hashedPassword,
            phone: fullPhone,
            countryCode: countryCode || '+1',
            referralCodeUsed: referralCode || '',
            userReferralCode,
            registrationDate: new Date().toISOString(),
            subscription: 'none',
            subscriptionExpiry: null,
            subscriptionPrice: 0,
            couponUsed: '',
            discountPercentage: 0,
            status: 'active',
            referralEarnings: 0,
            totalReferrals: 0,
            totalLoads: 0,
            totalRevenue: 0,
            totalProfit: 0,
            averageMargin: 0,
            stripeCustomerId: null
        };

        users[email] = newUser;
        loads[email] = [];
        reminders[email] = [];
        referrals[email] = [];

        // Handle referral if used
        if (referralCode) {
            const referrer = Object.values(users).find(u => u.userReferralCode === referralCode);
            if (referrer) {
                referrer.totalReferrals = (referrer.totalReferrals || 0) + 1;
                referrer.referralEarnings = (referrer.referralEarnings || 0) + 5.00;
                referrals[referrer.email] = referrals[referrer.email] || [];
                referrals[referrer.email].push({
                    referredEmail: email,
                    date: new Date().toISOString(),
                    earnings: 5.00
                });
            }
        }

        const token = jwt.sign(
            {
                userId: newUser.id,
                email: newUser.email,
                role: 'user'
            },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            success: true,
            message: 'Registration successful',
            token,
            user: {
                id: newUser.id,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                email: newUser.email,
                role: 'user',
                userReferralCode: newUser.userReferralCode
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during registration'
        });
    }
});

// Stripe Payment Routes
app.post('/api/create-customer', authenticateToken, async (req, res) => {
    try {
        const { email, name } = req.body;
        const userEmail = req.user.email;

        const customer = await stripe.customers.create({
            email: email,
            name: name,
            metadata: {
                userId: req.user.userId,
                userEmail: userEmail
            }
        });

        // Save Stripe customer ID to user
        if (users[userEmail]) {
            users[userEmail].stripeCustomerId = customer.id;
        }

        res.json({
            success: true,
            customerId: customer.id
        });

    } catch (error) {
        console.error('Create customer error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating customer'
        });
    }
});

app.post('/api/create-subscription', authenticateToken, async (req, res) => {
    try {
        const { priceId, paymentMethodId } = req.body;
        const userEmail = req.user.email;
        const user = users[userEmail];

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Create or get Stripe customer
        let customerId = user.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: userEmail,
                name: `${user.firstName} ${user.lastName}`,
                metadata: {
                    userId: user.id,
                    userEmail: userEmail
                }
            });
            customerId = customer.id;
            user.stripeCustomerId = customerId;
        }

        // Attach payment method to customer
        await stripe.paymentMethods.attach(paymentMethodId, {
            customer: customerId,
        });

        // Set as default payment method
        await stripe.customers.update(customerId, {
            invoice_settings: {
                default_payment_method: paymentMethodId,
            },
        });

        // Create subscription
        const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: priceId }],
            payment_behavior: 'default_incomplete',
            payment_settings: { save_default_payment_method: 'on_subscription' },
            expand: ['latest_invoice.payment_intent'],
            metadata: {
                userId: user.id,
                userEmail: userEmail,
                plan: Object.keys(subscriptionPlans).find(key => subscriptionPlans[key].stripePriceId === priceId)
            }
        });

        // Save subscription info
        subscriptions[userEmail] = {
            subscriptionId: subscription.id,
            status: subscription.status,
            plan: Object.keys(subscriptionPlans).find(key => subscriptionPlans[key].stripePriceId === priceId),
            currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString()
        };

        res.json({
            success: true,
            subscriptionId: subscription.id,
            clientSecret: subscription.latest_invoice.payment_intent.client_secret,
            status: subscription.status
        });

    } catch (error) {
        console.error('Create subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating subscription: ' + error.message
        });
    }
});

app.post('/api/confirm-payment', authenticateToken, async (req, res) => {
    try {
        const { subscriptionId } = req.body;
        const userEmail = req.user.email;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        
        if (subscription.status === 'active') {
            // Update user subscription
            const user = users[userEmail];
            const plan = subscription.metadata.plan || 'monthly';
            const planDetails = subscriptionPlans[plan];
            
            if (user && planDetails) {
                user.subscription = plan;
                user.subscriptionPrice = planDetails.price;
                user.subscriptionExpiry = new Date(Date.now() + planDetails.duration * 24 * 60 * 60 * 1000).toISOString();
                user.status = 'active';

                // Update subscription record
                subscriptions[userEmail] = {
                    subscriptionId: subscription.id,
                    status: subscription.status,
                    plan: plan,
                    currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
                    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString()
                };
            }

            res.json({
                success: true,
                message: 'Payment confirmed and subscription activated',
                subscription: {
                    plan: plan,
                    status: 'active',
                    expiry: user.subscriptionExpiry
                }
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Payment not confirmed yet'
            });
        }

    } catch (error) {
        console.error('Confirm payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Error confirming payment'
        });
    }
});

app.get('/api/subscription-status', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const user = users[userEmail];

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        let subscriptionStatus = {
            status: 'inactive',
            plan: 'none',
            expiry: null,
            isActive: false
        };

        // Check if subscription exists in Stripe
        if (user.stripeCustomerId) {
            const subscriptions = await stripe.subscriptions.list({
                customer: user.stripeCustomerId,
                status: 'active',
                limit: 1
            });

            if (subscriptions.data.length > 0) {
                const activeSubscription = subscriptions.data[0];
                subscriptionStatus = {
                    status: activeSubscription.status,
                    plan: activeSubscription.metadata.plan || 'monthly',
                    expiry: new Date(activeSubscription.current_period_end * 1000).toISOString(),
                    isActive: activeSubscription.status === 'active'
                };

                // Update user record
                user.subscription = subscriptionStatus.plan;
                user.subscriptionExpiry = subscriptionStatus.expiry;
                user.status = 'active';
            }
        }

        // Fallback to local subscription data
        if (subscriptionStatus.status === 'inactive' && user.subscription && user.subscription !== 'none') {
            const isExpired = new Date(user.subscriptionExpiry) < new Date();
            subscriptionStatus = {
                status: isExpired ? 'expired' : 'active',
                plan: user.subscription,
                expiry: user.subscriptionExpiry,
                isActive: !isExpired
            };
        }

        res.json({
            success: true,
            subscription: subscriptionStatus
        });

    } catch (error) {
        console.error('Subscription status error:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking subscription status'
        });
    }
});

app.post('/api/cancel-subscription', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const user = users[userEmail];

        if (!user || !user.stripeCustomerId) {
            return res.status(404).json({
                success: false,
                message: 'No active subscription found'
            });
        }

        const subscriptions = await stripe.subscriptions.list({
            customer: user.stripeCustomerId,
            status: 'active',
            limit: 1
        });

        if (subscriptions.data.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No active subscription found'
            });
        }

        const subscription = subscriptions.data[0];
        await stripe.subscriptions.cancel(subscription.id);

        // Update user record
        user.subscription = 'none';
        user.subscriptionExpiry = null;
        user.subscriptionPrice = 0;
        user.status = 'inactive';

        delete subscriptions[userEmail];

        res.json({
            success: true,
            message: 'Subscription cancelled successfully'
        });

    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Error cancelling subscription'
        });
    }
});

// Get Stripe Publishable Key
app.get('/api/stripe-key', (req, res) => {
    res.json({
        success: true,
        publishableKey: STRIPE_PUBLISHABLE_KEY
    });
});

// Get Subscription Plans
app.get('/api/subscription-plans', (req, res) => {
    const plans = Object.entries(subscriptionPlans).map(([key, plan]) => ({
        id: key,
        name: plan.name,
        price: plan.price,
        duration: plan.duration,
        stripePriceId: plan.stripePriceId
    }));

    res.json({
        success: true,
        plans: plans
    });
});

// Webhook for Stripe events
app.post('/api/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || 'whsec_xxx');
    } catch (err) {
        console.error('Webhook signature verification failed.', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'invoice.payment_succeeded':
            const invoice = event.data.object;
            await handleSuccessfulPayment(invoice);
            break;
        case 'customer.subscription.updated':
            const subscription = event.data.object;
            await handleSubscriptionUpdate(subscription);
            break;
        case 'customer.subscription.deleted':
            const deletedSubscription = event.data.object;
            await handleSubscriptionCancellation(deletedSubscription);
            break;
        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    res.json({received: true});
});

// Webhook handlers
async function handleSuccessfulPayment(invoice) {
    try {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const customer = await stripe.customers.retrieve(invoice.customer);
        const userEmail = customer.email;

        if (users[userEmail]) {
            const user = users[userEmail];
            const plan = subscription.metadata.plan || 'monthly';
            const planDetails = subscriptionPlans[plan];

            user.subscription = plan;
            user.subscriptionPrice = planDetails.price;
            user.subscriptionExpiry = new Date(subscription.current_period_end * 1000).toISOString();
            user.status = 'active';

            subscriptions[userEmail] = {
                subscriptionId: subscription.id,
                status: subscription.status,
                plan: plan,
                currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
                currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString()
            };

            console.log(`Subscription activated for ${userEmail}: ${plan}`);
        }
    } catch (error) {
        console.error('Error handling successful payment:', error);
    }
}

async function handleSubscriptionUpdate(subscription) {
    try {
        const customer = await stripe.customers.retrieve(subscription.customer);
        const userEmail = customer.email;

        if (users[userEmail] && subscriptions[userEmail]) {
            subscriptions[userEmail].status = subscription.status;
            subscriptions[userEmail].currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();

            if (subscription.status === 'active') {
                users[userEmail].status = 'active';
                users[userEmail].subscriptionExpiry = new Date(subscription.current_period_end * 1000).toISOString();
            }
        }
    } catch (error) {
        console.error('Error handling subscription update:', error);
    }
}

async function handleSubscriptionCancellation(subscription) {
    try {
        const customer = await stripe.customers.retrieve(subscription.customer);
        const userEmail = customer.email;

        if (users[userEmail]) {
            users[userEmail].subscription = 'none';
            users[userEmail].subscriptionExpiry = null;
            users[userEmail].subscriptionPrice = 0;
            users[userEmail].status = 'inactive';

            delete subscriptions[userEmail];

            console.log(`Subscription cancelled for ${userEmail}`);
        }
    } catch (error) {
        console.error('Error handling subscription cancellation:', error);
    }
}

// Loads Management Routes (Same as before)
app.post('/api/loads/save', authenticateToken, (req, res) => {
    try {
        const loadData = req.body;
        const userEmail = req.user.email;

        // Check subscription status for non-admin users
        if (req.user.role !== 'admin') {
            const user = users[userEmail];
            const isSubscriptionActive = user.subscription && user.subscription !== 'none' && 
                                       new Date(user.subscriptionExpiry) > new Date();
            
            if (!isSubscriptionActive) {
                return res.status(403).json({
                    success: false,
                    message: 'Active subscription required to save loads. Please upgrade your plan.'
                });
            }
        }

        if (!loads[userEmail]) {
            loads[userEmail] = [];
        }

        const newLoad = {
            id: uuidv4(),
            ...loadData,
            timestamp: new Date().toISOString(),
            userEmail: userEmail,
            userName: `${users[userEmail]?.firstName} ${users[userEmail]?.lastName}`,
            currentTimestamp: new Date().toLocaleString()
        };

        loads[userEmail].push(newLoad);

        // Update user stats
        const user = users[userEmail];
        if (user) {
            user.totalLoads = loads[userEmail].length;
            user.totalRevenue = loads[userEmail].reduce((sum, load) => sum + (load.revenue || 0), 0);
            user.totalProfit = loads[userEmail].reduce((sum, load) => sum + (load.profit || 0), 0);
            user.averageMargin = user.totalLoads > 0 ?
                loads[userEmail].reduce((sum, load) => sum + (load.profitMargin || 0), 0) / user.totalLoads : 0;
        }

        res.json({
            success: true,
            message: 'Load saved successfully',
            load: newLoad,
            loadId: newLoad.id
        });

    } catch (error) {
        console.error('Save load error:', error);
        res.status(500).json({
            success: false,
            message: 'Error saving load data'
        });
    }
});

// Reminder Routes (Same as before)
app.post('/api/reminders', authenticateToken, (req, res) => {
    try {
        const { text, dateTime } = req.body;
        const userEmail = req.user.email;

        if (!text || !dateTime) {
            return res.status(400).json({
                success: false,
                message: 'Reminder text and date/time are required'
            });
        }

        const reminderTime = new Date(dateTime);
        const now = new Date();

        if (reminderTime <= now) {
            return res.status(400).json({
                success: false,
                message: 'Please select a future date and time'
            });
        }

        if (!reminders[userEmail]) {
            reminders[userEmail] = [];
        }

        const reminder = {
            id: uuidv4(),
            text: text,
            time: reminderTime.getTime(),
            datetime: dateTime,
            active: true,
            createdAt: new Date().toISOString()
        };

        reminders[userEmail].push(reminder);

        res.json({
            success: true,
            message: 'Reminder set successfully',
            reminder: reminder
        });

    } catch (error) {
        console.error('Set reminder error:', error);
        res.status(500).json({
            success: false,
            message: 'Error setting reminder'
        });
    }
});

app.get('/api/reminders', authenticateToken, (req, res) => {
    try {
        const userEmail = req.user.email;
        const userReminders = reminders[userEmail] || [];

        res.json({
            success: true,
            reminders: userReminders
        });

    } catch (error) {
        console.error('Get reminders error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching reminders'
        });
    }
});

// Admin Routes (Same as before)
app.get('/api/admin/users', authenticateToken, (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin privileges required.'
            });
        }

        const allUsers = Object.values(users).map(user => {
            const userLoads = loads[user.email] || [];
            const totalRevenue = userLoads.reduce((sum, load) => sum + (load.revenue || 0), 0);
            const totalProfit = userLoads.reduce((sum, load) => sum + (load.profit || 0), 0);
            const avgMargin = userLoads.length > 0 ?
                userLoads.reduce((sum, load) => sum + (load.profitMargin || 0), 0) / userLoads.length : 0;

            return {
                ...user,
                password: undefined,
                loadsCount: userLoads.length,
                totalRevenue,
                totalProfit,
                averageMargin: avgMargin,
                isSubscriptionActive: user.subscription && user.subscription !== 'none' && 
                                    new Date(user.subscriptionExpiry) > new Date()
            };
        });

        res.json({
            success: true,
            users: allUsers
        });

    } catch (error) {
        console.error('Admin users error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching admin data'
        });
    }
});

// Utility function
function generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Middleware for authentication
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access token required'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }
        req.user = user;
        next();
    });
}

// Health check route
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'GoodMove Backend with Stripe is running!',
        timestamp: new Date().toISOString(),
        stripe: {
            publishableKey: STRIPE_PUBLISHABLE_KEY,
            configured: !!STRIPE_SECRET_KEY
        }
    });
});

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Welcome to GoodMove Logistics Backend API with Stripe Integration',
        version: '2.0.0',
        features: [
            'User Authentication',
            'Stripe Subscriptions',
            'Load Management',
            'Reminder System',
            'Admin Panel',
            'Referral System'
        ]
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`GoodMove Backend Server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Stripe Publishable Key: ${STRIPE_PUBLISHABLE_KEY}`);
    console.log('Stripe Integration: ✅ Active');
});