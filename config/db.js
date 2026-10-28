const mongoose = require('mongoose');
const dns = require('dns');

// Local-only fix for Windows / ISP DNS resolvers failing on MongoDB Atlas SRV records.
// Never apply on Vercel: it overrides the platform resolver and can slow or break lookups.
if (!process.env.VERCEL) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (_) {}
}

// Cached across invocations of a warm serverless instance.
let connectPromise = null;

const connectDB = () => {
  // Already connected: reuse.
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose);

  // Connection attempt in progress: share it.
  if (connectPromise) return connectPromise;

  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/test';
  connectPromise = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
      maxPoolSize: 5,
    })
    .then((conn) => {
      console.log(`MongoDB Connected Successfully ✅ (${conn.connection.host})`);
      return conn;
    })
    .catch((error) => {
      // Clear the cache so the next request retries instead of staying broken forever.
      connectPromise = null;
      console.error(`MongoDB Connection Error: ${error.message}`);
      throw error;
    });

  return connectPromise;
};

// Express middleware: make sure DB is connected before the route runs.
const ensureDB = async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    res.status(503).json({ message: 'Database temporarily unavailable. Please try again.' });
  }
};

// Reconnect on drop so a warm instance never stays dead.
mongoose.connection.on('disconnected', () => {
  connectPromise = null;
});

module.exports = connectDB;
module.exports.ensureDB = ensureDB;
