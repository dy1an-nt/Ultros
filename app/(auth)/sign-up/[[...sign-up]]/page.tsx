import { SignUp } from "@clerk/nextjs"
import { clerkAppearance } from "../../appearance"

export default function SignUpPage() {
  return <SignUp appearance={clerkAppearance} />
}
