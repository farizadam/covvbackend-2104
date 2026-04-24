require('dotenv').config();
const { sendEmail } = require('./src/services/emailService');

(async () => {
  try {
    const result = await sendEmail({
      // Updated recipient address
      to: 'farizadam20051027@gmail.com', 
      subject: 'Resend test from airport-app',
      text: 'This is a live test email sent through Resend from the airport-app backend.',
      html: '<p>This is a live test email sent through <strong>Resend</strong> from the airport-app backend.</p>'
    });

    console.log(JSON.stringify({ 
      ok: true, 
      id: result && result.id ? result.id : null 
    }, null, 2));

  } catch (error) {
    console.error(JSON.stringify({ 
      ok: false, 
      message: error && error.message ? error.message : String(error) 
    }, null, 2));
    process.exit(1);
  }
})();