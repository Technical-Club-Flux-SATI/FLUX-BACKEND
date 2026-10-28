const crypto = require("crypto");
const asyncHandler = require("express-async-handler");
const TechnovisionNovRegistration = require("../models/TechnovisionNovRegistration");

const EVENT_NAMES = {
  model: "Model Presentation",
  robo: "Robo Rumble",
  botRacing: "Walking Bot",
};

// Team size rules (including the leader)
const TEAM_SIZE_RULES = {
  model: { min: 2, max: 4 },
  robo: { min: 2, max: 4 },
  botRacing: { min: 2, max: 4 },
};

const MAX_TICKET_ATTEMPTS = 5;

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const EMAIL_REGEX = /^[^\s@]+@satiengg\.in$/i;
const EMAIL_ERROR = "must be a college email ID ending with @satiengg.in (personal email IDs are not accepted).";
const PHONE_REGEX = /^\d{10}$/;
const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (typeof forwarded === "string" && forwarded.split(",")[0].trim()) || req.ip || "";
  return ip.slice(0, 64);
};

const fail = (res, status, message) => {
  res.status(status);
  throw new Error(message);
};

/**
 * @route   POST /api/technovision-nov/register
 * @desc    Submit registration directly
 * @access  Public
 */
const registerTeam = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const { eventId, teamName, leaderYear } = body;

  // 1. Validate Event
  if (typeof eventId !== "string" || !EVENT_NAMES[eventId]) {
    fail(res, 400, "Invalid event selected.");
  }

  // 2. Validate Team Name + Leader details (all must be strings)
  const leaderFields = [
    body.leaderName,
    body.leaderEmail,
    body.leaderContact,
    body.leaderCollege,
    body.leaderBranch,
    body.leaderEnrollmentNo,
  ];
  if (!isNonEmptyString(teamName)) {
    fail(res, 400, "Team name is required.");
  }
  if (!leaderFields.every(isNonEmptyString) || !isNonEmptyString(leaderYear)) {
    fail(res, 400, "All team leader fields including Enrollment No. are compulsory.");
  }
  if (!YEARS.includes(leaderYear)) {
    fail(res, 400, "Invalid year selected for the team leader.");
  }

  const trimmedTeamName = teamName.trim();
  if (trimmedTeamName.length < 2 || trimmedTeamName.length > 60) {
    fail(res, 400, "Team name must be between 2 and 60 characters.");
  }

  const trimmedEmail = body.leaderEmail.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmedEmail)) {
    fail(res, 400, `Team leader email ${EMAIL_ERROR}`);
  }
  if (!PHONE_REGEX.test(body.leaderContact.trim())) {
    fail(res, 400, "Please enter a valid 10-digit contact number for the team leader.");
  }

  // 3. Validate Team Size Constraints
  const numericSize = Number(body.teamSize);
  const rule = TEAM_SIZE_RULES[eventId];
  if (!Number.isInteger(numericSize) || numericSize < rule.min || numericSize > rule.max) {
    fail(
      res,
      400,
      eventId === "botRacing"
        ? "Walking Bot allows a minimum of 2 and maximum of 4 members in the team."
        : "This event allows a minimum of 2 and maximum of 4 members in the team."
    );
  }

  // 4. Validate Additional Team Members
  const teamMembers = Array.isArray(body.teamMembers) ? body.teamMembers : [];
  const expectedMemberCount = numericSize - 1;
  if (teamMembers.length !== expectedMemberCount) {
    fail(
      res,
      400,
      `Expected ${expectedMemberCount} additional member details for a team size of ${numericSize}.`
    );
  }

  const seenEmails = new Set([trimmedEmail]);
  for (let i = 0; i < teamMembers.length; i++) {
    const m = teamMembers[i] || {};
    if (
      ![m.name, m.email, m.contact, m.college, m.branch, m.enrollmentNo].every(isNonEmptyString) ||
      !isNonEmptyString(m.year)
    ) {
      fail(res, 400, `All fields including Enrollment No. are compulsory for Member #${i + 2}.`);
    }
    if (!YEARS.includes(m.year)) {
      fail(res, 400, `Invalid year selected for Member #${i + 2}.`);
    }
    const memberEmail = m.email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(memberEmail)) {
      fail(res, 400, `Member #${i + 2} email ${EMAIL_ERROR}`);
    }
    if (!PHONE_REGEX.test(m.contact.trim())) {
      fail(res, 400, `Please enter a valid 10-digit contact number for Member #${i + 2}.`);
    }
    if (seenEmails.has(memberEmail)) {
      fail(res, 400, `Member #${i + 2} uses an email address already used in this team.`);
    }
    seenEmails.add(memberEmail);
  }

  // 5. Duplicate leader email: if it is the same team retrying (same phone + team name),
  //    return the existing ticket instead of an error so a lost ticket can be recovered.
  const isSameSubmission = (rec) =>
    rec.leaderContact === body.leaderContact.trim() &&
    rec.teamName.trim().toLowerCase() === trimmedTeamName.toLowerCase();

  const sendRecovered = (rec) =>
    res.status(200).json({
      success: true,
      recovered: true,
      message: "You are already registered. Here is your existing ticket.",
      ticketId: rec.ticketId,
      data: rec.toObject(),
    });

  const existing = await TechnovisionNovRegistration.findOne({
    eventId,
    leaderEmail: trimmedEmail,
  });

  if (existing) {
    if (isSameSubmission(existing)) return sendRecovered(existing);
    fail(res, 409, `A team led by '${trimmedEmail}' is already registered for this event.`);
  }

  // 6. (Per-IP limit removed: campus Wi-Fi and mobile carriers share IPs.)
  const clientIp = getClientIp(req);

  // 7. Check Duplicate Team Name within the same event (case-insensitive)
  const existingTeam = await TechnovisionNovRegistration.findOne({
    eventId,
    teamName: trimmedTeamName,
  }).collation({ locale: "en", strength: 2 });

  if (existingTeam) {
    fail(
      res,
      409,
      `Team name '${trimmedTeamName}' is already taken for this event. Please choose a different team name.`
    );
  }

  // 8. Save to Database (retry if the random ticket ID collides)
  const eventCode = eventId === "botRacing" ? "BOT" : eventId === "robo" ? "ROBO" : "MOD";
  const payload = {
    eventId,
    eventName: EVENT_NAMES[eventId],
    teamName: trimmedTeamName,
    teamSize: numericSize,
    leaderName: body.leaderName.trim(),
    leaderEmail: trimmedEmail,
    leaderContact: body.leaderContact.trim(),
    leaderCollege: body.leaderCollege.trim(),
    leaderBranch: body.leaderBranch.trim(),
    leaderEnrollmentNo: body.leaderEnrollmentNo.trim(),
    leaderYear,
    teamMembers: teamMembers.map((m) => ({
      name: m.name.trim(),
      email: m.email.trim().toLowerCase(),
      contact: m.contact.trim(),
      college: m.college.trim(),
      branch: m.branch.trim(),
      enrollmentNo: m.enrollmentNo.trim(),
      year: m.year,
    })),
    status: "confirmed",
    submitterIp: clientIp || undefined,
  };

  let registration = null;
  for (let attempt = 1; attempt <= MAX_TICKET_ATTEMPTS; attempt++) {
    const ticketId = `FLUX-TV26-${eventCode}-${crypto.randomInt(100000, 1000000)}`;
    try {
      registration = await TechnovisionNovRegistration.create({ ...payload, ticketId });
      break;
    } catch (err) {
      const isTicketCollision = err?.code === 11000 && err?.keyPattern?.ticketId;
      if (err?.code === 11000 && !isTicketCollision) {
        // Double-submit race: the same team was saved by a parallel request.
        const saved = await TechnovisionNovRegistration.findOne({ eventId, leaderEmail: trimmedEmail });
        if (saved && isSameSubmission(saved)) return sendRecovered(saved);
      }
      if (!isTicketCollision || attempt === MAX_TICKET_ATTEMPTS) throw err;
    }
  }

  const data = registration.toObject();
  delete data.submitterIp;

  res.status(201).json({
    success: true,
    message: "Registration successful!",
    ticketId: registration.ticketId,
    data,
  });
});

/**
 * @route   GET /api/technovision-nov/registrations
 * @desc    Fetch all registered teams (Admin protected)
 * @access  Private (Key-Gated)
 */
const getAllRegistrations = asyncHandler(async (req, res) => {
  const registrations = await TechnovisionNovRegistration.find().sort({
    createdAt: -1,
  });

  res.status(200).json({
    success: true,
    count: registrations.length,
    data: registrations,
  });
});

/**
 * @route   DELETE /api/technovision-nov/registrations/:id
 * @desc    Delete a registration record (Admin protected)
 * @access  Private (Key-Gated)
 */
const deleteRegistration = asyncHandler(async (req, res) => {
  const registration = await TechnovisionNovRegistration.findById(req.params.id);

  if (!registration) {
    res.status(404);
    throw new Error("Registration not found.");
  }

  await registration.deleteOne();

  res.status(200).json({
    success: true,
    message: "Registration deleted successfully.",
  });
});

module.exports = {
  registerTeam,
  getAllRegistrations,
  deleteRegistration,
};
