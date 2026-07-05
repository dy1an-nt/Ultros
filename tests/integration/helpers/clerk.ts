// Mutable auth state read by the @clerk/nextjs/server mock in
// tests/integration/setup.ts. Tests flip identity per case; setup resets it
// to signed-out before each test.
export const authState = { clerkId: null as string | null }

export function signInAs(clerkId: string) {
  authState.clerkId = clerkId
}

export function signOut() {
  authState.clerkId = null
}
