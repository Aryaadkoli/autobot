import nodemailer from "nodemailer";

// Account/team emails (welcome on signup, "you've been added to X") — a
// separate concern from core/channels (customer WhatsApp/email sends).
// This is Gmail SMTP with an App Password for now (GMAIL_USER +
// GMAIL_APP_PASSWORD in .env) since there's no Brevo account yet; the
// owner said they'll switch the sending address to a proper business
// Gmail later — swapping GMAIL_USER/GMAIL_APP_PASSWORD is the only change
// needed then. Falls back to logging the email instead of sending when
// those env vars aren't set, same "mock until credentials exist" pattern
// as core/channels/whatsapp.ts.
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
    // Never let a notification email failure break the actual action
    // (signup, adding a teammate) that triggered it.
    console.error(`[mailer] Failed to send "${subject}" to ${to}:`, err);
  }
}
