import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import MarketingHome from "./components/MarketingHome";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/forecast");
  }

  return <MarketingHome />;
}
