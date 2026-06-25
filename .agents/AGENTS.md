
# DRIVER REGISTRATION LOGIC FREEZE (CRITICAL)

**DO NOT MODIFY** the following aspects of the codebase without EXPLICIT, prior user consent. The driver registration link (/login/?role=driver) is currently LIVE on social media and any regressions will break real-world recruitment.

## Frozen Flows & Logic:
1. **Public Driver Link:** The route /login/?role=driver and the URL parameter handling in LoginPageClient.tsx (e.g. clientRole logic).
2. **Incomplete Driver State:** 
   - New accounts created with email/password MUST be initialized with:
     ole: "incomplete_driver"
     onboardingIncomplete: true
     profileCompleted: false
     egistrationStatus: "pending_profile"
   - These users must NEVER appear in admin/municipal dashboards.
3. **Incomplete Driver Routing:** incomplete_driver users must ALWAYS be routed to /driver/register. They must never be treated as passengers or sent to passenger dashboards.
4. **Completed Driver State:** Upon completing the onboarding form, they transition to:
     ole: "driver"
     municipalStatus: "pending_municipal_review"
     profileCompleted: true
     onboardingIncomplete: false
5. **Admin/Municipal Visibility:** Only after reaching the completed state (ole: "driver") should they appear in the admin/municipal panels for review.

## Frozen Files (No logic changes allowed):
- src/app/login/LoginPageClient.tsx (Auth logic, role matching, redirects)
- src/features/auth/AuthGuard.tsx (Route protection and onboarding enforcement)
- src/app/auth/continue/page.tsx (Fallback routing)
- src/app/driver/DriverClientLayout.tsx (Allowed roles guard)
- src/components/driver/DriverRegisterClient.tsx (Registration frontend logic)
- unctions/src/onboarding.ts (Backend registration mutations)
- unctions/src/users.ts (Claims validation for roles)

**EXCEPTION:** Minor visual tweaks (CSS) or text/copy changes are permitted, but the underlying boolean logic, role checks, and routing redirects must remain untouched.

