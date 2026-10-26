
const mongoose = require("mongoose");
const dns = require("dns");

// Optional DNS configuration for MongoDB Atlas on some Windows networks.
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (_) {}

const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error(
      "MongoDB connection failed: MONGO_URI is missing. Add it to your backend .env file."
    );
    return;
  }

  try {
    const conn = await mongoose.connect(uri);
    console.log(
      `MongoDB Connected Successfully ✅ (${conn.connection.host})`
    );
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    console.error(
      "Check your MONGO_URI, database credentials, network access, and database status."
    );
  }
};

module.exports = connectDB;

