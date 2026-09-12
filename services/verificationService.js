const { getCompatibleGroups } = require('./matchingEngine');

const VALID_BLOOD_GROUPS = new Set(['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']);

const HOSPITAL_WHITELIST = [
  'indus hospital',
  'aga khan',
  'liaquat national',
  'jinnah hospital',
  'civil hospital',
  'south city hospital',
  'national medical'
];

/**
 * Validates the parsed request fields deterministically.
 * @param {object} parsedFields - Output from geminiService.parseRequest
 * @returns {{ isValid: boolean, reason: string|null }}
 */
function verifyRequest(parsedFields) {
  if (!parsedFields) {
    return { isValid: false, reason: "No fields parsed from input." };
  }

  // 1. Validate Blood Group
  if (parsedFields.blood_group) {
    const bg = parsedFields.blood_group.toUpperCase().replace(/\s+/g, '');
    if (!VALID_BLOOD_GROUPS.has(bg)) {
      return { isValid: false, reason: `Invalid blood group format: "${parsedFields.blood_group}"` };
    }
  } else if (parsedFields.is_complete) {
    return { isValid: false, reason: "Missing blood group in completed request." };
  }

  // 2. Validate Count (Units required)
  if (parsedFields.count !== undefined && parsedFields.count !== null) {
    const count = parseInt(parsedFields.count, 10);
    if (isNaN(count) || count < 1) {
      return { isValid: false, reason: `Invalid unit count: must be at least 1 (got "${parsedFields.count}")` };
    }
    if (count > 10) {
      return { isValid: false, reason: `Suspicious unit count: "${parsedFields.count}" exceeds max threshold of 10. Suspended for human review.` };
    }
  }

  // 3. Validate Hospital Location
  if (parsedFields.hospital) {
    const hName = parsedFields.hospital.toLowerCase().trim();
    const matched = HOSPITAL_WHITELIST.some(h => hName.includes(h));
    if (!matched) {
      return { 
        isValid: false, 
        reason: `Hospital "${parsedFields.hospital}" is not in the system registry. Suspended to verify coordinates.` 
      };
    }
  } else if (parsedFields.is_complete) {
    return { isValid: false, reason: "Missing hospital location in completed request." };
  }

  return { isValid: true, reason: null };
}

module.exports = { verifyRequest, VALID_BLOOD_GROUPS, HOSPITAL_WHITELIST };
