import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const { record } = await req.json();
    const name = record.name?.split(" ")[0] || "there";
    const email = record.email;

    const emailBody = `Hi ${name},

Thanks for applying to be a CLPeasy beta tester!

We've received your application and will review it within 24 hours. You'll get another email from us when your 7-day trial is ready to go.

In the meantime, if you have any questions feel free to email us at support@clpeasy.com.

Michaela
CLPeasy — CLP compliance made simple
https://clpeasy.com`;

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": Deno.env.get("BREVO_API_KEY") || "",
      },
      body: JSON.stringify({
        sender: { name: "CLPeasy", email: "noreply@clpeasy.com" },
        to: [{ email, name: record.name }],
        subject: "We've received your CLPeasy beta application!",
        textContent: emailBody,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
