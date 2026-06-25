const { Resend } = require('resend');

const getResendClient = () => {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
};

const TEMPLATES = {
  login: {
    title: 'Your login code',
    body: 'Enter this code to complete your sign-in. It expires in <strong style="color:#aaa;">5 minutes</strong>.',
    subject: (code) => `${code} — Your Escape Login Code`,
  },
  verify_email: {
    title: 'Verify your email address',
    body: 'Enter this code to verify your email address and activate your account. It expires in <strong style="color:#aaa;">10 minutes</strong>.',
    subject: (code) => `${code} — Verify Your Escape Account`,
  },
  password_reset: {
    title: 'Reset your password',
    body: 'Enter this code to reset your password. It expires in <strong style="color:#aaa;">10 minutes</strong>. If you didn\'t request this, you can safely ignore this email.',
    subject: (code) => `${code} — Escape Password Reset Code`,
  },
};

const OTP_HTML = (otpCode, purpose = 'login') => {
  const tpl = TEMPLATES[purpose] || TEMPLATES.login;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#080808;font-family:'Inter',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080808;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#111111;border:1px solid #1f1f1f;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:40px 40px 24px;text-align:center;border-bottom:1px solid #1f1f1f;">
            <div style="font-size:14px;letter-spacing:4px;font-weight:900;color:#ffffff;text-transform:uppercase;">ESCAPE</div>
            <div style="font-size:11px;color:#555;margin-top:4px;letter-spacing:2px;text-transform:uppercase;">Skate Platform</div>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <div style="font-size:20px;font-weight:800;color:#ffffff;margin-bottom:12px;">${tpl.title}</div>
            <div style="font-size:14px;color:#777;margin-bottom:32px;line-height:1.6;">${tpl.body}</div>
            <div style="background:#000;border:1px solid #2a2a2a;border-radius:12px;padding:24px;text-align:center;margin-bottom:32px;">
              <span style="font-size:40px;font-weight:900;letter-spacing:12px;color:#ffffff;font-family:monospace;">${otpCode}</span>
            </div>
            <div style="font-size:12px;color:#444;line-height:1.7;">
              If you didn't request this code, you can safely ignore this email.<br>
              Never share this code with anyone.
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #1f1f1f;text-align:center;">
            <span style="font-size:11px;color:#333;letter-spacing:1px;">ESCAPE · SKATE PLATFORM</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

const sendOTP = async (toEmail, otpCode, purpose = 'login') => {
  const resend = getResendClient();
  const tpl = TEMPLATES[purpose] || TEMPLATES.login;

  if (!resend) {
    console.warn('\n╔══════════════════════════════════════════╗');
    console.warn('║  EMAIL NOT CONFIGURED — DEV FALLBACK     ║');
    console.warn(`║  To: ${toEmail.padEnd(34)}║`);
    console.warn(`║  Purpose: ${(purpose || 'login').padEnd(27)}║`);
    console.warn(`║  OTP Code: ${otpCode.padEnd(26)}║`);
    console.warn('╚══════════════════════════════════════════╝\n');
    return { success: true, simulated: true };
  }

  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Escape <onboarding@resend.dev>';

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [toEmail],
      subject: tpl.subject(otpCode),
      html: OTP_HTML(otpCode, purpose),
    });

    if (error) {
      console.error('Resend API Error:', error);
      console.warn('Falling back to simulated OTP delivery.');
      return { success: true, simulated: true };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error('Mailer execution error:', err.message);
    console.warn('Falling back to simulated OTP delivery due to exception.');
    return { success: true, simulated: true };
  }
};

module.exports = { sendOTP };
