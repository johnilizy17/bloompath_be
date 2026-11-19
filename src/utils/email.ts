/**
 * Email sender utility using Resend (https://resend.com).
 * Swap for AWS SES or any HTTP-based email API — just replace sendEmail().
 */

export interface EmailOptions {
  to: string
  subject: string
  html: string
}

export async function sendEmail(
  options: EmailOptions,
  resendApiKey: string,
  fromAddress: string,
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [options.to],
      subject: options.subject,
      html: options.html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Email send failed: ${res.status} — ${body}`)
  }
}

/** OTP login email template */
export function otpEmailHtml(otp: string, appName: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Your ${appName} login code</title></head>
<body style="font-family:sans-serif;background:#f9fafb;padding:40px 0;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.06);">
    <h1 style="color:#1a1a2e;font-size:24px;margin-bottom:8px;">${appName}</h1>
    <p style="color:#555;font-size:16px;margin-bottom:32px;">Your sign-in code is below. It expires in 10 minutes.</p>
    <div style="background:#f0fdf4;border-radius:8px;padding:20px;text-align:center;margin-bottom:32px;">
      <span style="font-size:40px;font-weight:700;letter-spacing:10px;color:#16a34a;">${otp}</span>
    </div>
    <p style="color:#888;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
  </div>
</body>
</html>
`
}
