import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Building2, CheckCircle2, Shield, Users } from 'lucide-react';
import {
  HERO_BANNER_PATH,
  MUNICIPAL_WARDS,
  SEAL_EMBLEM_PATH,
} from '../../constants/civicData';
import { useAuth } from '../../hooks/useAuth';

export function AuthScreen() {
  const {
    firebaseUser,
    needsRegistration,
    authError,
    signInWithGoogle,
    completeRegistration,
    signOut,
  } = useAuth();

  const [signingIn, setSigningIn] = useState(false);
  const [heroLoaded, setHeroLoaded] = useState(true);
  const [sealLoaded, setSealLoaded] = useState(true);

  const [fullName, setFullName] = useState(firebaseUser?.displayName || '');
  const [phone, setPhone] = useState('');
  const [ward, setWard] = useState(MUNICIPAL_WARDS[0]);
  const [city, setCity] = useState('Bengaluru');
  const [submittingProfile, setSubmittingProfile] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (firebaseUser?.displayName && !fullName) {
      setFullName(firebaseUser.displayName);
    }
  }, [firebaseUser?.displayName, fullName]);

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch {
      // Handled by context authError
    } finally {
      setSigningIn(false);
    }
  };

  const handleRegistrationSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (fullName.trim().length < 2) {
      setFormError('Please enter your full name.');
      return;
    }
    setSubmittingProfile(true);
    setFormError(null);
    try {
      await completeRegistration({
        fullName: fullName.trim(),
        phone: phone.trim(),
        ward,
        city: city.trim() || 'Bengaluru',
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to complete registration.');
    } finally {
      setSubmittingProfile(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top 3-zone institutional bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-4">
          <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
            {sealLoaded ? (
              <img
                src={SEAL_EMBLEM_PATH}
                alt="JANASEVA AI Seal"
                referrerPolicy="no-referrer"
                onError={() => setSealLoaded(false)}
                className="h-9 w-9 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-900 text-teal-400">
                <Shield className="h-5 w-5" />
              </div>
            )}
            <span className="font-display text-lg font-bold tracking-tight text-navy-900">
              JANASEVA AI
            </span>
          </div>

          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#portals" className="whitespace-nowrap shrink-0 hover:text-navy-900">
              Civic Portals
            </a>
            <a href="#agents" className="whitespace-nowrap shrink-0 hover:text-navy-900">
              AI Orchestration
            </a>
            <a href="#categories" className="whitespace-nowrap shrink-0 hover:text-navy-900">
              Departments
            </a>
            <a href="#transparency" className="whitespace-nowrap shrink-0 hover:text-navy-900">
              SLA Charter
            </a>
          </nav>

          <div className="shrink-0">
            {!needsRegistration ? (
              <button
                type="button"
                disabled={signingIn}
                onClick={handleGoogleLogin}
                className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60 whitespace-nowrap"
              >
                <span>{signingIn ? 'Connecting...' : 'Portal Sign In'}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={signOut}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                Switch Account
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Split Hero & Authentication Workspace */}
      <main className="mx-auto max-w-7xl px-6 py-10 lg:py-14">
        <div className="grid items-stretch gap-8 lg:grid-cols-12">
          {/* Left 7 Columns: Authoritative Institutional Hero */}
          <div className="flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-navy-900 text-white lg:col-span-7">
            <div className="p-8 lg:p-10">
              <p className="text-xs font-semibold tracking-wider text-teal-300 uppercase">
                National Digital Municipal Grievance Grid
              </p>
              <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-white sm:text-4xl">
                Intelligent Government Complaint Management &amp; Resolution
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-300">
                JANASEVA AI connects citizens, municipal field officers, and civic administrators
                through a transparent six-agent orchestration pipeline—validating evidence,
                triaging safety urgency, routing departments, and tracking SLA compliance.
              </p>

              <div className="mt-8 grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-3">
                <div>
                  <p className="font-mono text-xl font-bold text-teal-300 tabular-nums">6 Agents</p>
                  <p className="mt-0.5 text-xs text-slate-300">
                    Intake, Classification, Priority, Routing, SOP &amp; Escalation
                  </p>
                </div>
                <div>
                  <p className="font-mono text-xl font-bold text-teal-300 tabular-nums">5 Wings</p>
                  <p className="mt-0.5 text-xs text-slate-300">
                    Roads, Sanitation, Streetlights, Water &amp; Drainage
                  </p>
                </div>
                <div>
                  <p className="font-mono text-xl font-bold text-teal-300 tabular-nums">100% Audit</p>
                  <p className="mt-0.5 text-xs text-slate-300">
                    Officer-approved actions &amp; timestamped accountability
                  </p>
                </div>
              </div>
            </div>

            <div className="relative h-56 w-full sm:h-64">
              {heroLoaded ? (
                <img
                  src={HERO_BANNER_PATH}
                  alt="Modern Indian municipal civic center infrastructure"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroLoaded(false)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-navy-800 to-teal-900">
                  <Building2 className="h-14 w-14 text-teal-300/60" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-navy-950/85 via-navy-900/20 to-transparent" />
              <div className="absolute bottom-4 left-6 right-6 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-200">
                <span>Role-Based Governance · Citizen, Officer &amp; Admin Portals</span>
                <span className="font-mono text-teal-300">Verified Firestore Persistence</span>
              </div>
            </div>
          </div>

          {/* Right 5 Columns: Sign In or Complete Registration Card */}
          <div className="flex flex-col justify-center rounded-xl border border-slate-200 bg-white p-8 lg:col-span-5">
            {!needsRegistration ? (
              <div>
                <h2 className="font-display text-2xl font-bold text-navy-900">
                  Access JANASEVA AI Portal
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Sign in securely with your verified Google account. Citizens gain immediate access
                  to grievance submission and live tracking; authorized municipal officers and
                  administrators unlock operational and oversight consoles.
                </p>

                {authError ? (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                    {authError}
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={signingIn}
                  onClick={handleGoogleLogin}
                  className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60"
                >
                  <span>{signingIn ? 'Authenticating...' : 'Continue with Google Account'}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>

                <div className="mt-8 space-y-4 border-t border-slate-200 pt-6" id="portals">
                  <div className="flex items-start gap-3">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Citizen Portal</p>
                      <p className="text-xs text-slate-600">
                        Submit complaints with site photos, inspect AI analysis, track progress, and
                        rate resolution quality.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Government Officer Dashboard
                      </p>
                      <p className="text-xs text-slate-600">
                        Approve AI department routing, upload resolution evidence, request details,
                        and escalate overdue cases.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Shield className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Administrator Command Console
                      </p>
                      <p className="text-xs text-slate-600">
                        Monitor SLA compliance, recurring civic hotspots, department metrics, and
                        AI agent execution logs.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRegistrationSubmit} className="space-y-4">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-teal-700 uppercase">
                    Step 2 of 2 · Account Onboarding
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-bold text-navy-900">
                    Complete Civic Registration
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Signed in as <span className="font-medium text-slate-900">{firebaseUser?.email}</span>
                  </p>
                </div>

                {formError || authError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 break-all">
                    {formError || authError}
                  </div>
                ) : null}

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Full Legal Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Ananya Sharma"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Mobile Number
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      City / Municipality
                    </label>
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Primary Municipal Ward
                  </label>
                  <select
                    value={ward}
                    onChange={(e) => setWard(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  >
                    {MUNICIPAL_WARDS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={submittingProfile}
                  className="w-full rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-60"
                >
                  {submittingProfile ? 'Creating Civic Profile...' : 'Register & Enter Portal'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Bottom Reference Section for Categories & SLA */}
        <section
          id="categories"
          className="mt-10 grid gap-6 border-t border-slate-200 pt-8 md:grid-cols-2"
        >
          <div id="agents">
            <h3 className="font-display text-base font-bold text-navy-900">
              Six-Agent Orchestration Architecture
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Every grievance triggers a coordinated server-side AI pipeline: Complaint Intake
              (multimodal photo inspection), Classification, Priority Triage, Department Routing,
              Resolution SOP Recommendation, and SLA Monitoring &amp; Escalation.
            </p>
          </div>
          <div id="transparency">
            <h3 className="font-display text-base font-bold text-navy-900">
              Human-in-the-Loop Civic Accountability
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              AI recommendations never bypass governance oversight. Department routing requires
              explicit Government Officer approval, field closures require photographic evidence,
              and every transition is logged to an immutable audit trail.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
