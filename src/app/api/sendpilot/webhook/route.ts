import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "SendPilot webhook integration is not configured. No SendPilot webhook contract is implemented. Import a CSV, XLS, or XLSX export instead.",
    },
    { status: 501 },
  );
}
