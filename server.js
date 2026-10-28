const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors'); // Imported only once
const http = require('http');
const connectDB = require('./config/db');
const { socketHandler } = require('./socket/socketHandler');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
// At the top with other require() statements:
const faqRoutes = require('./routes/faqRoutes');

// 1. Load Environment & Connect Database
dotenv.config();
connectDB().catch(() => {}); // failure is logged; ensureDB retries on the next request

const app = express();
const server = http.createServer(app);

// 2. Global Middlewares

// Define your allowed origins in one place
const allowedOrigins = [
    // Production Custom Domains
    'https://www.clubflux.in',
    'https://clubflux.in',
    'http://www.clubflux.in',
    'http://clubflux.in',
    
    // Deployment Platforms
    'https://clubflux.netlify.app',
    'https://clubflux.vercel.app',
    'https://fluxsati.vercel.app',
    
    // Local Development
    'http://localhost:5173',
    'http://localhost:3000',
     'http://localhost:5000'
];

app.use(cors({
    origin: function (origin, callback) {
        // 1. Allow internal requests (mobile apps, Postman, server-to-server)
        if (!origin) return callback(null, true);

        // 2. Check if the incoming origin matches our allowed list
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            // Log the blocked origin for debugging in Vercel logs
            console.error(`CORS blocked for origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-fluxwave-key', 'x-recruitment-key', 'x-technovision-key']
}));

app.use(express.json());

// 3. API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/contact', require('./routes/contactRoutes'));
app.use('/api/projects', require('./routes/projectRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/fluxwave', require('./routes/fluxWaveRoutes'));
// With other app.use() route registrations:
app.use('/api/faq', faqRoutes);
app.use('/api/recruitment', require('./routes/recruitmentRoutes'));
app.use('/api/technovision-nov', require('./routes/technovisionNovRoutes'));

// Health check (also usable by an uptime pinger to keep the function warm)
app.get('/api/health', async (req, res) => {
    try {
        await connectDB();
        res.json({ status: 'ok', db: 'connected' });
    } catch (error) {
        res.status(503).json({ status: 'error', db: 'disconnected' });
    }
});

// Root Route
app.get('/', (req, res) => {
    res.send('Flux-Web API is running with Shop & Socket systems active...');
});

// 4. Socket.io Initialization
// Note: You must ensure `socketHandler` applies these same CORS origins 
// inside its own `new Server(server, { cors: ... })` config.
const io = socketHandler(server); 
app.set('socketio', io); 

// 5. Error Handling Middleware (MUST BE LAST)
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// 6. Start Server
server.listen(PORT, () => {
    console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});