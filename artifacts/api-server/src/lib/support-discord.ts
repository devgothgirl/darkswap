type SupportReport = {
  id: string;
  email: string;
  issue: string;
  route?: string;
  orderReference?: string;
  transactionHash?: string;
  message: string;
};

function webhookEndpoint(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "discord.com" ||
      url.username || url.password || url.port || url.search || url.hash ||
      !/^\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+$/.test(url.pathname)) return null;
    url.searchParams.set("wait", "true");
    return url.toString();
  } catch {
    return null;
  }
}

export async function postSupportToDiscord(report: SupportReport, webhookUrl: string): Promise<boolean> {
  const endpoint = webhookEndpoint(webhookUrl);
  if (!endpoint) return false;

  const fields = [
    { name: "Issue", value: report.issue.replaceAll("_", " "), inline: true },
    { name: "Route", value: report.route?.replaceAll("_", " ") || "Not provided", inline: true },
    { name: "Reply email", value: report.email, inline: false },
    { name: "Order / deposit reference", value: report.orderReference || "Not provided", inline: false },
    { name: "Sending transaction hash", value: report.transactionHash || "Not provided", inline: false },
    { name: "Customer message", value: report.message.slice(0, 1000), inline: false },
  ];
  if (report.message.length > 1000) {
    fields.push({ name: "Customer message (continued)", value: report.message.slice(1000, 2000), inline: false });
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `New DarkSwap support report • ${report.id}`,
        allowed_mentions: { parse: [] },
        embeds: [{
          title: "Website support report",
          color: 0xcba8fa,
          fields,
          footer: { text: "User-submitted report, not a verified order status. Reply to the customer by email; never request wallet secrets." },
        }],
      }),
    });
    if (!response.ok) return false;
    const data: unknown = await response.json();
    return !!data && typeof data === "object" && "id" in data && typeof data.id === "string";
  } catch {
    return false;
  }
}