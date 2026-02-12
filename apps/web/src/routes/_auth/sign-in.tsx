import { ROUTES } from '@/constants';
import { SignIn } from '@clerk/clerk-react';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignIn
        routing="path"
        path={ROUTES.SIGN_IN}
        signUpUrl={ROUTES.SIGN_UP}
        forceRedirectUrl={ROUTES.HOME}
      />
    </div>
  );
}
