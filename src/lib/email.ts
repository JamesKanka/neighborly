interface EmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const htmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);
}

export async function sendEmail(input: EmailInput) {
  const serverToken = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.EMAIL_FROM;

  if (!serverToken || !from) {
    // Dev fallback when provider is not configured.
    console.log("EMAIL", {
      to: input.to,
      subject: input.subject
    });
    return;
  }

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Postmark-Server-Token": serverToken
    },
    body: JSON.stringify({
      From: from,
      To: input.to,
      Subject: input.subject,
      HtmlBody: input.html,
      TextBody: input.text,
      MessageStream: process.env.POSTMARK_MESSAGE_STREAM || "outbound"
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`POSTMARK_ERROR: ${errorText}`);
  }
}
