const express = require("express");
const router = express.Router();

const {
  registerParticipant,
  getDomains,
  getRegistrationCount,
  getAllRegistrations,
  submitIdea,
  submitFinal,
  updateStatus,
  checkIn,
} = require("../controllers/fluxWaveController");

// Admin-only actions (evaluate, check-in, list all) are protected here.
const { protect, admin } = require("../middleware/authMiddleware");

// Temporary key-gated event admin (no login) — remove after FluxWave 2.0 ends
const eventAdminAuth = require("../middleware/eventAdminAuth");
const { ensureDB } = require("../config/db");

// ---- Round 0: Registration (Jul 11-20) ----
// POST /api/fluxwave/register
router.post("/register", registerParticipant);

// GET /api/fluxwave/domains -> list of valid domains
router.get("/domains", getDomains);

// GET /api/fluxwave/count -> live count of registered teams
router.get("/count", getRegistrationCount);

// ---- Round 1: Idea & PPT submission (Jul 20-28) ----
// PUT /api/fluxwave/submit-idea
router.put("/submit-idea", submitIdea);

// ---- Round 2: Final project submission at the Grand Finale (Aug 1) ----
// PUT /api/fluxwave/submit-final
router.put("/submit-final", submitFinal);

// ---- Evaluation (Jul 29-31) — admin only ----
// PATCH /api/fluxwave/:id/status -> shortlist / reject / mark finalist
router.patch("/:id/status", protect, admin, ensureDB, updateStatus);

// ---- Grand Finale check-in (Aug 1) — admin only ----
// PATCH /api/fluxwave/:id/checkin -> mark a finalist team as checked in at KSH
router.patch("/:id/checkin", protect, admin, ensureDB, checkIn);

// GET /api/fluxwave/registrations -> all registrations — admin only
router.get("/registrations", protect, admin, ensureDB, getAllRegistrations);

// ---- TEMPORARY: key-gated event admin, no login required ----
// Delete this whole block once FluxWave 2.0 wraps up.
router.get("/public-admin/registrations", eventAdminAuth, ensureDB, getAllRegistrations);
router.patch("/public-admin/:id/status", eventAdminAuth, ensureDB, updateStatus);
router.patch("/public-admin/:id/checkin", eventAdminAuth, ensureDB, checkIn);

module.exports = router;