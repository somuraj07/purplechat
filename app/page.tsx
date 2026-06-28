import { ChatApp } from "@/app/components/ChatApp";
import { LoginForm } from "@/app/components/LoginForm";
import { getPartnerSession } from "@/lib/auth";

export default async function Home() {
  const session = await getPartnerSession();

  return session ? <ChatApp session={session} /> : <LoginForm />;
}
