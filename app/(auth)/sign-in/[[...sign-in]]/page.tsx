import { SignIn } from "@clerk/nextjs"
import { clerkAppearance } from "../../appearance"

export default function SignInPage() {
  return <SignIn appearance={clerkAppearance} />
}
