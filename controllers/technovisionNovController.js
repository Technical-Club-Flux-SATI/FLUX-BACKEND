const crypto = require("crypto");
const asyncHandler = require("express-async-handler");
const TechnovisionNovRegistration = require("../models/TechnovisionNovRegistration");

const EVENT_NAMES = {
  model: "Model Presentation",
  robo: "Robo Rumble",
  botRacing: "Walking Bot",
};

const TEAM_SIZE_RULES = {
  model: { min: 2, max: 4 },
  robo: { min: 2, max: 4 },
  botRacing: { min: 2, max: 4 },
};

const MAX_TEAMS_PER_IP =
  Number(process.env.TECHNOVISION_MAX_TEAMS_PER_IP) || 50;

const MAX_TICKET_ATTEMPTS = 5;

const isNonEmptyString = (v) =>
  typeof v === "string" && v.trim().length > 0;

const EMAIL_REGEX = /^[^\s@]+@satiengg\.in$/i;
const EMAIL_ERROR =
  "must be a college email ID ending with @satiengg.in (personal email IDs are not accepted).";
const PHONE_REGEX = /^\d{10}$/;
const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];

const normalize = (value) =>
  String(value ?? "").trim().toLowerCase();

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (typeof forwarded === "string" && forwarded.split(",")[0].trim()) ||
    req.ip ||
    "";

  return ip.slice(0, 64);
};

const fail = (res, status, message) => {
  res.status(status);
  throw new Error(message);
};

// Compare every relevant field, not just the team name or leader email.

const isSameRegistration = (registration, submitted) => {
  return (
    normalize(registration.eventId) === normalize(submitted.eventId) &&
    normalize(registration.leaderEmail) === normalize(submitted.leaderEmail) &&
    normalize(registration.leaderContact) === normalize(submitted.leaderContact) &&
    normalize(registration.leaderEnrollmentNo) === normalize(submitted.leaderEnrollmentNo) &&
    normalize(registration.teamName) === normalize(submitted.teamName)
  );
};


const sendRecovered = (res, registration) => {
  const data = registration.toObject();
  delete data.submitterIp;

  return res.status(200).json({
    success: true,
    recovered: true,
    message:
      "You are already registered. Here is your existing ticket.",
    ticketId: registration.ticketId,
    data,
  });
};

/**
 * @route   POST /api/technovision-nov/register
 * @desc    Submit registration or recover an exact existing registration
 * @access  Public
 */
const registerTeam = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const { eventId, teamName, leaderYear } = body;

  // 1. Validate event.
  if (typeof eventId !== "string" || !EVENT_NAMES[eventId]) {
    fail(res, 400, "Invalid event selected.");
  }

  // 2. Validate team name and leader details.
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

  if (
    !leaderFields.every(isNonEmptyString) ||
    !isNonEmptyString(leaderYear)
  ) {
    fail(
      res,
      400,
      "All team leader fields including Enrollment No. are compulsory."
    );
  }

  if (!YEARS.includes(leaderYear)) {
    fail(res, 400, "Invalid year selected for the team leader.");
  }

  const trimmedTeamName = teamName.trim();
  const trimmedEmail = body.leaderEmail.trim().toLowerCase();
  const trimmedContact = body.leaderContact.trim();
  const trimmedLeaderEnrollment =
    body.leaderEnrollmentNo.trim();

  if (trimmedTeamName.length < 2 || trimmedTeamName.length > 60) {
    fail(res, 400, "Team name must be between 2 and 60 characters.");
  }

  if (!EMAIL_REGEX.test(trimmedEmail)) {
    fail(res, 400, `Team leader email ${EMAIL_ERROR}`);
  }

  if (!PHONE_REGEX.test(trimmedContact)) {
    fail(
      res,
      400,
      "Please enter a valid 10-digit contact number for the team leader."
    );
  }

  // 3. Validate team size.
  const numericSize = Number(body.teamSize);
  const rule = TEAM_SIZE_RULES[eventId];

  if (
    !Number.isInteger(numericSize) ||
    numericSize < rule.min ||
    numericSize > rule.max
  ) {
    fail(
      res,
      400,
      eventId === "botRacing"
        ? "Walking Bot allows a minimum of 2 and maximum of 4 members in the team."
        : "This event allows a minimum of 2 and maximum of 4 members in the team."
    );
  }

  // 4. Validate additional members.
  const teamMembers = Array.isArray(body.teamMembers)
    ? body.teamMembers
    : [];

  const expectedMemberCount = numericSize - 1;

  if (teamMembers.length !== expectedMemberCount) {
    fail(
      res,
      400,
      `Expected ${expectedMemberCount} additional member details for a team size of ${numericSize}.`
    );
  }

  const seenEmails = new Set([trimmedEmail]);
  const seenEnrollments = new Set([
    normalize(trimmedLeaderEnrollment),
  ]);

  const normalizedMembers = [];

  for (let i = 0; i < teamMembers.length; i++) {
    const member = teamMembers[i] || {};
    const memberNumber = i + 2;

    if (
      ![
        member.name,
        member.email,
        member.contact,
        member.college,
        member.branch,
        member.enrollmentNo,
      ].every(isNonEmptyString) ||
      !isNonEmptyString(member.year)
    ) {
      fail(
        res,
        400,
        `All fields including Enrollment No. are compulsory for Member #${memberNumber}.`
      );
    }

    if (!YEARS.includes(member.year)) {
      fail(
        res,
        400,
        `Invalid year selected for Member #${memberNumber}.`
      );
    }

    const email = member.email.trim().toLowerCase();
    const contact = member.contact.trim();
    const enrollmentNo = member.enrollmentNo.trim();

    if (!EMAIL_REGEX.test(email)) {
      fail(
        res,
        400,
        `Member #${memberNumber} email ${EMAIL_ERROR}`
      );
    }

    if (!PHONE_REGEX.test(contact)) {
      fail(
        res,
        400,
        `Please enter a valid 10-digit contact number for Member #${memberNumber}.`
      );
    }

    if (seenEmails.has(email)) {
      fail(
        res,
        400,
        `Member #${memberNumber} uses an email address already used in this team.`
      );
    }

    seenEmails.add(email);

    const enrollmentKey = normalize(enrollmentNo);

    if (seenEnrollments.has(enrollmentKey)) {
      fail(
        res,
        400,
        `Member #${memberNumber} uses an enrollment number already used in this team.`
      );
    }

    seenEnrollments.add(enrollmentKey);

    normalizedMembers.push({
      name: member.name.trim(),
      email,
      contact,
      college: member.college.trim(),
      branch: member.branch.trim(),
      enrollmentNo,
      year: member.year,
    });
  }

  const eventName = EVENT_NAMES[eventId];

  // Build the normalized registration data used for both recovery
  // comparison and saving.
  const submitted = {
    eventId,
    eventName,
    teamName: trimmedTeamName,
    teamSize: numericSize,
    leaderName: body.leaderName.trim(),
    leaderEmail: trimmedEmail,
    leaderContact: trimmedContact,
    leaderCollege: body.leaderCollege.trim(),
    leaderBranch: body.leaderBranch.trim(),
    leaderEnrollmentNo: trimmedLeaderEnrollment,
    leaderYear,
    teamMembers: normalizedMembers,
  };

  // 5. RECOVERY CHECK MUST HAPPEN BEFORE GENERAL DUPLICATE CHECKS.
  //
  // Search only within the selected event. An exact repeat submission
  // returns the saved ticket; a mismatch continues to duplicate checks.
  const existingLeader = await TechnovisionNovRegistration.findOne({
    eventId,
    leaderEmail: trimmedEmail,
  });

  
if (existingLeader) {
  // Same event + leader email + phone:
  // return the original ticket, even if the team name changed.
  if (
    normalize(existingLeader.leaderContact) ===
    normalize(trimmedContact)
  ) {
    return sendRecovered(res, existingLeader);
  }

  // Same email but a different phone: block the request.
  fail(
    res,
    409,
    `Sorry, this email is already registered with a different phone number for this event: ${eventName}. Please try another email or contact the organizers.`
  );
}


  // 6. Block a participant already registered as a leader or member.
  // Only inspect registrations for the selected event.
  const submittedParticipants = [
    {
      name: submitted.leaderName,
      email: submitted.leaderEmail,
      contact: submitted.leaderContact,
      enrollmentNo: submitted.leaderEnrollmentNo,
    },
    ...normalizedMembers.map((member) => ({
      name: member.name,
      email: member.email,
      contact: member.contact,
      enrollmentNo: member.enrollmentNo,
    })),
  ];

  const registrationsForEvent =
    await TechnovisionNovRegistration.find({ eventId });

  for (const registration of registrationsForEvent) {
    const registeredParticipants = [
      {
        name: registration.leaderName,
        email: registration.leaderEmail,
        contact: registration.leaderContact,
        enrollmentNo: registration.leaderEnrollmentNo,
      },
      ...(registration.teamMembers || []).map((member) => ({
        name: member.name,
        email: member.email,
        contact: member.contact,
        enrollmentNo: member.enrollmentNo,
      })),
    ];

    for (const participant of submittedParticipants) {
      const duplicate = registeredParticipants.find((registered) => {
        const sameEmail =
          normalize(registered.email) === normalize(participant.email);

        const submittedEnrollment = normalize(
          participant.enrollmentNo
        );

        const sameEnrollment =
          submittedEnrollment !== "" &&
          normalize(registered.enrollmentNo) === submittedEnrollment;

        return sameEmail || sameEnrollment;
      });

      if (duplicate) {
        const sameEmail =
          normalize(duplicate.email) === normalize(participant.email);

        const differentPhone =
          normalize(duplicate.contact) !== normalize(participant.contact);

        if (sameEmail && differentPhone) {
          fail(
            res,
            409,
            `Sorry, this email is already registered with a different phone number for this event: ${eventName}. Please try another email or contact the organizers.`
          );
        }

        fail(
          res,
          409,
          `${participant.name} is already registered in a team for ${eventName}. A person cannot join multiple teams in the same event.`
        );
      }
    }
  }

  // 7. Per-IP limit.
  const clientIp = getClientIp(req);

  if (clientIp) {
    const teamsFromIp =
      await TechnovisionNovRegistration.countDocuments({
        submitterIp: clientIp,
      });

    if (teamsFromIp >= MAX_TEAMS_PER_IP) {
      fail(
        res,
        429,
        `Registration limit reached for this network (${MAX_TEAMS_PER_IP} teams). Please contact the organizers for help.`
      );
    }
  }

  // 8. Team name must be unique within the selected event.
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

  // 9. Create the registration and ticket.
  const eventCode =
    eventId === "botRacing"
      ? "BOT"
      : eventId === "robo"
        ? "ROBO"
        : "MOD";

  const payload = {
    ...submitted,
    status: "confirmed",
    submitterIp: clientIp || undefined,
  };

  let registration = null;

  for (
    let attempt = 1;
    attempt <= MAX_TICKET_ATTEMPTS;
    attempt++
  ) {
    const ticketId = `FLUX-TV26-${eventCode}-${crypto.randomInt(
      100000,
      1000000
    )}`;

    try {
      registration = await TechnovisionNovRegistration.create({
        ...payload,
        ticketId,
      });

      break;
    } catch (err) {
      const isTicketCollision =
        err?.code === 11000 && err?.keyPattern?.ticketId;

      // A concurrent request may have saved the same leader's team
      // after our initial recovery check. Re-check before returning an error.
      if (err?.code === 11000 && !isTicketCollision) {
        const saved = await TechnovisionNovRegistration.findOne({
          eventId,
          leaderEmail: trimmedEmail,
        });

        if (saved) {
          if (isSameRegistration(saved, submitted)) {
            return sendRecovered(res, saved);
          }

          if (
            normalize(saved.leaderContact) !==
            normalize(trimmedContact)
          ) {
            fail(
              res,
              409,
              `Sorry, this email is already registered with a different phone number for this event: ${eventName}. Please try another email or contact the organizers.`
            );
          }

          fail(
            res,
            409,
            `This email is already registered for ${eventName}. You cannot register another team with the same email for this event.`
          );
        }
      }

      if (!isTicketCollision || attempt === MAX_TICKET_ATTEMPTS) {
        throw err;
      }
    }
  }

  if (!registration) {
    throw new Error(
      "Could not generate a unique ticket. Please try again."
    );
  }

  const data = registration.toObject();
  delete data.submitterIp;

  return res.status(201).json({
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
  const registration = await TechnovisionNovRegistration.findById(
    req.params.id
  );

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
