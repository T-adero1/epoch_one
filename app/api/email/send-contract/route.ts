import { NextResponse } from 'next/server';
import { generateSigningLink } from '@/app/utils/signatures';

interface EmailRequest {
  contractId: string;
  contractTitle: string;
  ownerName: string;
  signerEmails: string[];
}

// Email template for signing invitation
const generateEmailTemplate = (
    contractTitle: string,
    ownerName: string,
    signingLink: string,
  ) => {
    
    const subject = `Signature requested – "${contractTitle}"`;
  
    // HTML BODY (fully inlined)
    const htmlContent = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
      "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
    <html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>${subject}</title>
      </head>
  
      <body style="Margin:0;padding:0;background-color:#f2f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#333333;">
        <!-- Hidden pre-header text (appears in inbox previews) -->
        <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
          Sign the contract "${contractTitle}" sent by ${ownerName}. Click to review and sign securely.
        </div>
  
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f2f4f6;">
          <tr>
            <td align="center" style="padding:24px 0;">
              <!-- Container -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
                <!-- Header -->
                <tr>
                  <td align="center" style="background-color:#2563eb;padding:32px;">
                    <h1 style="Margin:0;font-size:20px;line-height:28px;color:#ffffff;">Signature Required</h1>
                  </td>
                </tr>
  
                <!-- Body -->
                <tr>
                  <td style="padding:32px 40px;background-color:#ffffff;text-align:center;">
                    <h2 style="Margin:0 0 16px 0;font-size:18px;line-height:26px;color:#333333;text-align:center;">Hello,</h2>
                    <p style="Margin:0 0 16px 0;font-size:15px;line-height:24px;text-align:center;">
                      <strong>${ownerName}</strong> has invited you to sign the contract:
                    </p>
                    <p style="Margin:0 0 24px 0;font-size:17px;line-height:26px;font-weight:600;text-align:center;">"${contractTitle}"</p>
                    <p style="Margin:0 0 24px 0;font-size:15px;line-height:24px;text-align:center;">
                      Click the button below to review and sign securely:
                    </p>
  
                    <!-- Bullet-proof button -->
                    <table role="presentation" cellpadding="0" cellspacing="0" style="Margin:0 auto 32px auto;">
                      <tr>
                        <td align="center" bgcolor="#2563eb" style="border-radius:6px;">
                          <a href="${signingLink}"
                             style="display:inline-block;padding:12px 28px;font-size:15px;line-height:22px;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">
                            Review & Sign
                          </a>
                        </td>
                      </tr>
                    </table>
  
                    <p style="Margin:0 0 16px 0;font-size:14px;line-height:22px;color:#4b5563;text-align:center;">
                      If the button doesn't work, copy and paste this link into your browser:
                    </p>
                    <p style="Margin:0 0 24px 0;padding:12px;background-color:#f8fafc;border-radius:4px;font-size:13px;line-height:22px;word-break:break-all;color:#2563eb;text-align:center;">
                      ${signingLink}
                    </p>
  
                    <p style="Margin:0;font-size:13px;line-height:20px;color:#4b5563;text-align:center;">
                      <strong>Security notice:</strong> this is an encrypted, tamper-evident signing flow powered by EpochOne. Review the terms carefully before signing.
                    </p>
                  </td>
                </tr>
  
                <!-- Footer -->
                <tr>
                  <td align="center" style="padding:24px 40px;background-color:#f9fafb;font-size:12px;line-height:18px;color:#6b7280;">
                    This is a transactional email sent automatically by EpochOne. Need help? <a href="mailto:support@epochone.com" style="color:#2563eb;text-decoration:none;">Contact Support</a>.
                  </td>
                </tr>
              </table>
              <!-- /Container -->
            </td>
          </tr>
        </table>
      </body>
    </html>`;
  
    // Plain-text alternative (always include one)
    const textContent = `Signature required – "${contractTitle}"
  
  ${ownerName} has invited you to sign the contract "${contractTitle}".
  
  Review and sign securely:
  ${signingLink}
  
  Security notice: this is an encrypted, tamper-evident signing flow powered by EpochOne.
  If you have questions, email support@epochone.com.
  
  — EpochOne (automated message)
  `;
  
    return { subject, htmlContent, textContent };
  };
  
  export default generateEmailTemplate;

// Send email via Brevo API
const sendBrevoEmail = async (to: string, subject: string, htmlContent: string, textContent: string) => {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': process.env.BREVO_API_KEY!,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: process.env.BREVO_SENDER_NAME || 'EpochOne E-sign',
        email: 'sign@epochone.io',
      },
      to: [{ email: to }],
      subject,
      htmlContent,
      textContent,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Brevo API error: ${response.status} - ${JSON.stringify(errorData)}`);
  }

  return response.json();
};

export async function POST(request: Request) {
  try {
    const { contractId, contractTitle, ownerName, signerEmails }: EmailRequest = await request.json();

    if (!contractId || !contractTitle || !ownerName || !signerEmails?.length) {
      return NextResponse.json(
        { error: 'Missing required fields: contractId, contractTitle, ownerName, or signerEmails' },
        { status: 400 }
      );
    }

    // Check if Brevo is configured
    if (!process.env.BREVO_API_KEY ) {
      console.error('Brevo configuration missing');
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      );
    }

    const signingLink = generateSigningLink(contractId);
    const emailTemplate = generateEmailTemplate(contractTitle, ownerName, signingLink);

    // Send emails to all signers
    const emailPromises = signerEmails.map(async (email) => {
      try {
        const result = await sendBrevoEmail(
          email,
          emailTemplate.subject,
          emailTemplate.htmlContent,
          emailTemplate.textContent
        );
        return { email, success: true, messageId: result.messageId };
      } catch (error) {
        console.error(`Failed to send email to ${email}:`, error);
        return { email, success: false, error: error.message };
      }
    });

    const results = await Promise.all(emailPromises);
    const successCount = results.filter(r => r.success).length;
    const failedEmails = results.filter(r => !r.success);

    if (successCount === 0) {
      return NextResponse.json(
        { error: 'Failed to send emails to any recipients', details: failedEmails },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Emails sent successfully to ${successCount}/${signerEmails.length} recipients`,
      results,
      ...(failedEmails.length > 0 && { partialFailure: failedEmails })
    });

  } catch (error) {
    console.error('Email sending error:', error);
    return NextResponse.json(
      { error: 'Failed to send contract signing emails' },
      { status: 500 }
    );
  }
} 