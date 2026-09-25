import { redirect } from "next/navigation";

export default function FollowUpsRedirect() {
  redirect("/opportunities?interest=not-interested");
}
