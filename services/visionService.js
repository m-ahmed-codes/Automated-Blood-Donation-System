const { GoogleGenAI } = require('@google/genai');

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function buildFallbackData(imageBuffer) {
  const hasImage = !!imageBuffer && imageBuffer.length > 0;
  const fileSize = hasImage ? imageBuffer.length : 0;
  const score = hasImage ? 65 : 0;

  return {
    hospital_name: null,
    doctor_name: null,
    doctor_reg_number: null,
    patient_name: null,
    units_required: null,
    stamp_present: false,
    status: hasImage ? 'pending_review' : 'rejected',
    score,
    reason: hasImage
      ? 'Image captured; awaiting multimodal verification fallback.'
      : 'No image buffer provided for requisition verification.',
    raw: { fileSize },
  };
}

async function verifyRequisition(imageBuffer) {
  if (!imageBuffer || imageBuffer.length === 0) {
    return {
      is_valid: false,
      score: 0,
      status: 'rejected',
      reason: 'No requisition image supplied.',
      extracted: {
        hospital_name: null,
        doctor_name: null,
        doctor_reg_number: null,
        patient_name: null,
        units_required: null,
        stamp_present: false,
      },
    };
  }

  if (!process.env.GEMINI_API_KEY) {
    return buildFallbackData(imageBuffer);
  }

  try {
    const imageBase64 = imageBuffer.toString('base64');
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: imageBase64,
              },
            },
            {
              text: `Extract a JSON object with keys: hospital_name, doctor_name, doctor_reg_number, patient_name, units_required, stamp_present. Return only valid JSON. Also include a confidence score 0-100 and status: auto_pass, pending_review, or rejected.`
            },
          ],
        },
      ],
    });

    const text = response?.text || response?.output_text || '';
    const jsonText = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(jsonText);

    const score = Number(parsed.score || 0);
    let status = 'rejected';
    if (score >= 70) status = 'auto_pass';
    else if (score >= 40) status = 'pending_review';

    return {
      is_valid: status !== 'rejected',
      score,
      status,
      reason: parsed.reason || 'Vision verification complete.',
      extracted: {
        hospital_name: parsed.hospital_name || null,
        doctor_name: parsed.doctor_name || null,
        doctor_reg_number: parsed.doctor_reg_number || null,
        patient_name: parsed.patient_name || null,
        units_required: parsed.units_required || null,
        stamp_present: Boolean(parsed.stamp_present),
      },
    };
  } catch (err) {
    console.warn('[VisionService] Gemini verification failed, using fallback heuristic:', err.message);
    return buildFallbackData(imageBuffer);
  }
}

module.exports = { verifyRequisition };
