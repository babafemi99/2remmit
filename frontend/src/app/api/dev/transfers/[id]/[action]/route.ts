const ACTIONS = new Set(["simulate-success", "simulate-failure"]);

type Context = { params: Promise<{ id: string; action: string }> };

export async function POST(_request: Request, context: Context) {
  const apiBaseUrl = process.env.DJANGO_API_BASE_URL;
  const { id, action } = await context.params;
  if (!ACTIONS.has(action))
    return Response.json(
      { detail: "Unknown simulator action." },
      { status: 404 },
    );
  if (!apiBaseUrl)
    return Response.json(
      { detail: "The provider simulator is unavailable in this environment." },
      { status: 500 },
    );
  try {
    const upstream = await fetch(
      `${apiBaseUrl.replace(/\/$/, "")}/api/dev/transfers/${encodeURIComponent(id)}/${action}/`,
      { method: "POST", cache: "no-store" },
    );
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { detail: "The provider simulator could not be reached." },
      { status: 502 },
    );
  }
}
