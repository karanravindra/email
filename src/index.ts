import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		if (request.method === "OPTIONS") {
			return new Response(null, {
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "POST, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type",
				},
			});
		}

		if (request.method !== "POST") {
			return new Response("Only POST allowed", { status: 405 });
		}

		try {
			const contentType = request.headers.get("content-type") || "";
			let body: Record<string, string> = {};

			if (contentType.includes("application/json")) {
				body = await request.json();
			} else {
				const form = await request.formData();
				body = Object.fromEntries(form);
			}

			const { name, email, subject, message, website } = body;

			// Simple honeypot
			if (website) return new Response("ok", { status: 204 });

			if (!email || !message) {
				return new Response("Missing required fields", { status: 400 });
			}

			// Build MIME message
			const mime = createMimeMessage();
			mime.setSender({
				name: "Watts.ai Contact Form",
				addr: "no-reply@watts.ai",
			});
			mime.setRecipient("you@watts.ai");
			mime.setSubject(subject || `Message from ${name || "Contact Form"}`);
			mime.addHeader("Reply-To", `${name || "Visitor"} <${email}>`);
			mime.addMessage({
				contentType: "text/plain",
				data: `From: ${name} <${email}>\n\n${message}`,
			});
			mime.addMessage({
				contentType: "text/html",
				data: `<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p><p>${escapeHtml(message)}</p>`,
			});

			// Create and send
			const msg = new EmailMessage(
				"no-reply@watts.ai",
				"you@watts.ai",
				mime.asRaw(),
			);

			await env.MAILER.send(msg);

			return new Response(JSON.stringify({ ok: true }), {
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Content-Type": "application/json",
				},
			});
		} catch (err: any) {
			return new Response(
				JSON.stringify({ error: err?.message || "Send failed" }),
				{
					status: 500,
					headers: { "Access-Control-Allow-Origin": "*" },
				},
			);
		}
	},
};

interface Env {
	MAILER: { send: (m: EmailMessage) => Promise<void> };
}

function escapeHtml(s = "") {
	return s.replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			]!,
	);
}
