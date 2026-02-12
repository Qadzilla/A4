import { ROUTES } from '@/constants';
import { SignUp } from '@clerk/clerk-react';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignUp
        routing="path"
        path={ROUTES.SIGN_UP}
        signInUrl={ROUTES.SIGN_IN}
        forceRedirectUrl={ROUTES.HOME}
      />
    </div>
  );
}
