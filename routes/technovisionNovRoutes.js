const express = require("express");
const router = express.Router();
const {
  registerTeam,
  getAllRegistrations,
  deleteRegistration,
} = require("../controllers/technovisionNovController");
const technovisionAdminAuth = require("../middleware/technovisionAdminAuth");
const { ensureDB } = require("../config/db");

// POST /api/technovision-nov/register
router.post("/register", ensureDB, registerTeam);

// Admin endpoints (Protected by Key)
router.post("/verify-key", technovisionAdminAuth, (req, res) => {
  res.json({ success: true, message: "Technovision admin key verified successfully." });
});
router.get("/registrations", technovisionAdminAuth, getAllRegistrations);
router.delete("/registrations/:id", technovisionAdminAuth, deleteRegistration);

module.exports = router;
