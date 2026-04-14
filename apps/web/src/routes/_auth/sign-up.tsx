import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router';
import { useSignUp } from '@clerk/clerk-react';
import { Logo } from '@/components/landing/Logo';
import { DEV_AUTH_BYPASS } from '@/lib/clerk';

type View = 'form' | 'verify';

function getClerkError(err: unknown): string {
  const e = err as { errors?: { longMessage?: string }[]; message?: string };
  return e.errors?.[0]?.longMessage || e.message || 'Something went wrong';
}

function ClerkSignUpForm() {
  const { signUp, setActive, isLoaded } = useSignUp();
  return <SignUpForm signUp={signUp} setActive={setActive} isLoaded={isLoaded} />;
}

function SignUpForm({
  devBypass,
  signUp,
  setActive,
  isLoaded,
}: {
  devBypass?: boolean;
  signUp?: ReturnType<typeof useSignUp>['signUp'];
  setActive?: ReturnType<typeof useSignUp>['setActive'];
  isLoaded?: boolean;
}) {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleOAuth = async (strategy: 'oauth_google' | 'oauth_apple' | 'oauth_github') => {
    if (devBypass) {
      navigate('/dashboard');
      return;
    }
    if (!signUp) return;
    try {
      await signUp.authenticateWithRedirect({
        strategy,
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/dashboard',
      });
    } catch (err) {
      setError(getClerkError(err));
    }
  };

  const handleSignUp = async () => {
    if (devBypass) {
      navigate('/dashboard');
      return;
    }
    if (!signUp || !setActive) return;
    setError('');
    setLoading(true);
    try {
      const nameParts = name.trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || undefined;

      const result = await signUp.create({
        emailAddress: email,
        password,
        firstName,
        lastName,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/dashboard');
      } else {
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        setView('verify');
      }
    } catch (err) {
      setError(getClerkError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (devBypass) {
      navigate('/dashboard');
      return;
    }
    if (!signUp || !setActive) return;
    setError('');
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/dashboard');
      }
    } catch (err) {
      setError(getClerkError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!signUp) return;
    setError('');
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
    } catch (err) {
      setError(getClerkError(err));
    }
  };

  const disabled = loading || (!devBypass && !isLoaded);

  return (
    <div
      className="min-h-screen flex flex-col text-white"
      style={{
        backgroundColor: '#0A0A0A',
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='2' height='2' fill='rgba(255, 255, 255, 0.10)'/%3E%3C/svg%3E")`,
      }}
    >
      <header className="absolute top-0 left-0 p-6">
        <Link to="/">
          <Logo variant="dark" className="w-[52px]" />
        </Link>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        className="flex flex-1 flex-col items-center justify-center px-4 w-full max-w-md mx-auto"
      >

        <div
          className="w-full bg-[#161616]/90 backdrop-blur-md p-8 sm:p-10"
          style={{
            borderTop: '1.5px solid rgba(16, 185, 129, 0.2)',
            borderLeft: '1.5px solid rgba(16, 185, 129, 0.2)',
            borderBottom: '2.5px solid #10B981',
            borderRight: '2.5px solid #10B981',
          }}
        >
          {view === 'form' && (
            <>
              <h1 className="text-xl font-semibold tracking-tight mb-1">Create your A4 account</h1>
              <p className="text-sm text-white/50 mb-8">Start your financial autonomy journey</p>

              {/* Social buttons */}
              <div className="flex flex-col gap-3 mb-6">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleOAuth('oauth_google')}
                  className="h-11 w-full border border-white/10 bg-white/5 flex items-center justify-center gap-3 text-sm font-medium text-white/80 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Continue with Google
                </button>

                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleOAuth('oauth_apple')}
                  className="h-11 w-full border border-white/10 bg-white/5 flex items-center justify-center gap-3 text-sm font-medium text-white/80 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                  </svg>
                  Continue with Apple
                </button>

                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleOAuth('oauth_github')}
                  className="h-11 w-full border border-white/10 bg-white/5 flex items-center justify-center gap-3 text-sm font-medium text-white/80 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                  </svg>
                  Continue with GitHub
                </button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1 h-[1px] bg-white/10" />
                <span className="text-xs text-white/30">or</span>
                <div className="flex-1 h-[1px] bg-white/10" />
              </div>

              {/* Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSignUp();
                }}
                className="flex flex-col gap-4"
              >
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Full name</label>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11 w-full bg-white/5 border border-white/10 text-white placeholder-white/30 px-4 text-sm rounded-none focus:outline-none focus:border-[#10B981]/50 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Email</label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 w-full bg-white/5 border border-white/10 text-white placeholder-white/30 px-4 text-sm rounded-none focus:outline-none focus:border-[#10B981]/50 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Password</label>
                  <input
                    type="password"
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 w-full bg-white/5 border border-white/10 text-white placeholder-white/30 px-4 text-sm rounded-none focus:outline-none focus:border-[#10B981]/50 transition-colors"
                  />
                </div>

                <p className="text-xs text-white/30 leading-relaxed">
                  By creating an account, you agree to our{' '}
                  <span className="text-white/50">Terms of Service</span> and{' '}
                  <span className="text-white/50">Privacy Policy</span>
                </p>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-2.5 rounded">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={disabled}
                  className="h-11 w-full bg-[#10B981] hover:bg-[#0D9B6A] text-white text-sm font-semibold transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating account...' : 'Create account'}
                </button>
              </form>

              <p className="text-sm text-white/40 text-center mt-6">
                Already have an account?{' '}
                <Link to="/sign-in" className="text-[#10B981] hover:text-[#0D9B6A] transition-colors">
                  Sign in
                </Link>
              </p>
            </>
          )}

          {view === 'verify' && (
            <>
              <h1 className="text-xl font-semibold tracking-tight mb-1">Check your email</h1>
              <p className="text-sm text-white/50 mb-8">
                We sent a verification code to <span className="text-white/70">{email}</span>
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleVerify();
                }}
                className="flex flex-col gap-4"
              >
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Verification code</label>
                  <input
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="h-11 w-full bg-white/5 border border-white/10 text-white placeholder-white/30 px-4 text-sm rounded-none focus:outline-none focus:border-[#10B981]/50 transition-colors"
                  />
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-2.5 rounded">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={disabled}
                  className="h-11 w-full bg-[#10B981] hover:bg-[#0D9B6A] text-white text-sm font-semibold transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Verifying...' : 'Verify'}
                </button>
              </form>

              <div className="flex items-center justify-center gap-4 mt-4">
                <button
                  type="button"
                  onClick={handleResendCode}
                  className="text-sm text-[#10B981] hover:text-[#0D9B6A] transition-colors"
                >
                  Resend code
                </button>
                <span className="text-white/20">|</span>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setView('form');
                  }}
                  className="text-sm text-white/40 hover:text-white/60 transition-colors"
                >
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function SignUpPage() {
  if (DEV_AUTH_BYPASS) return <SignUpForm devBypass />;
  return <ClerkSignUpForm />;
}
