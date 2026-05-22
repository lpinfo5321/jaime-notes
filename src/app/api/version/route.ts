export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ v: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" });
}
