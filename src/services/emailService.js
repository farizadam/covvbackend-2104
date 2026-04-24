const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ to, subject, text, html }) => {
  return await resend.emails.send({
    from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
    to,
    subject,
    text,
    html,
  });
};

module.exports = { sendEmail };