const express = require('express');
const router = express.Router();
const recruitmentAdminAuth = require('../middleware/recruitmentAdminAuth');
const { ensureDB } = require('../config/db');
const {
  registerCandidate,
  getRecruitmentStatus,
  getAllRecruitmentRegistrations,
  deleteRecruitmentRegistration,
  updateRecruitmentStatus,
} = require('../controllers/recruitmentController');

// POST /api/recruitment/register
router.post('/register', registerCandidate);

// GET /api/recruitment/status
router.get('/status', getRecruitmentStatus);

// POST /api/recruitment/verify-key (Key validation for admin portal)
router.post('/verify-key', recruitmentAdminAuth, (req, res) => {
  res.json({ success: true, message: 'Recruitment admin key verified successfully.' });
});

// GET /api/recruitment/registrations (Admin & Event Organizer portal - Protected by key)
router.get('/registrations', recruitmentAdminAuth, ensureDB, getAllRecruitmentRegistrations);

// PATCH /api/recruitment/status/:id (Protected by key)
router.patch('/status/:id', recruitmentAdminAuth, ensureDB, updateRecruitmentStatus);

// DELETE /api/recruitment/registrations/:id (Protected by key)
router.delete('/registrations/:id', recruitmentAdminAuth, ensureDB, deleteRecruitmentRegistration);

module.exports = router;
