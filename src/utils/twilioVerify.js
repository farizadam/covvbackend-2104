const twilio = require("twilio");

const VERIFY_SERVICE_SID =
  process.env.TWILIO_VERIFY_SERVICE_SID || "VA70ce5b7116f55690354847b1efd2bc88";

function getTwilioVerifyClient() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error(
      "Twilio credentials are missing. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
    );
  }

  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

async function sendSmsVerification(phoneNumber) {
  const client = getTwilioVerifyClient();
  return client.verify.v2
    .services(VERIFY_SERVICE_SID)
    .verifications.create({ to: phoneNumber, channel: "sms" });
}

async function checkSmsVerification(phoneNumber, code) {
  const client = getTwilioVerifyClient();
  return client.verify.v2
    .services(VERIFY_SERVICE_SID)
    .verificationChecks.create({ to: phoneNumber, code });
}

module.exports = {
  sendSmsVerification,
  checkSmsVerification,
};
