/** Which sign-in methods are available. Each turns on when its environment variables are set. */
export type AuthProviders = {
  google: boolean
  github: boolean
  email: boolean
}

export function emailDeliveryConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

export function authProviders(): AuthProviders {
  return {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    // In development the magic link is printed to the terminal, so email sign-in always works locally.
    email: emailDeliveryConfigured() || process.env.NODE_ENV !== 'production',
  }
}
