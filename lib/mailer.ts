import nodemailer from "nodemailer";

// Gmail SMTP (App Password) stand-in until there's a Brevo account; falls back to logging the email when GMAIL_USER/GMAIL_APP_PASSWORD aren't set, same mock-until-credentials pattern as core/channels/whatsapp.ts.
const gmailUser = process.env.GMAIL_USER;
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

const transporter =
  gmailUser && gmailAppPassword
    ? nodemailer.createTransport({
        service: "gmail",
        auth: { user: gmailUser, pass: gmailAppPassword },
      })
    : null;

export async function sendAccountEmail(to: string, subject: string, text: string): Promise<void> {
  if (!transporter) {
    console.log(`[mock email] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  try {
    await transporter.sendMail({ from: gmailUser, to, subject, text });
  } catch (err) {
    // Never let a notification email failure break the action that triggered it.
    console.error(`[mailer] Failed to send "${subject}" to ${to}:`, err);
  }
}
