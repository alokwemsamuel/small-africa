# Sign in with Google, Apple and Facebook: setup guide

The website can let customers sign up and sign in with Google, Apple or Facebook. The code is
finished and tested; **each provider switches on by itself as soon as its keys are in the server's
`.env` file.** Until then its button is hidden (a button that can't work is never shown).

Written for someone who has never done this before. Allow about **30 minutes per provider**
(Apple also needs a paid account and a few days to be approved).

| | Google | Facebook | Apple |
|---|---|---|---|
| Cost | Free | Free | **US$99 a year** (Apple Developer Program) |
| Who needs an account | The business | The business | The business |
| Approval wait | None | None for sign-in with name and email | Enrolment can take a few days |
| Needs a live HTTPS website | Yes | Yes | **Yes, and no `localhost`** |

> **Who should own these accounts?** The restaurant, not the developer. Create each developer
> account with a **business email address** (for example `it@smallafrica.ng`), keep the logins in the
> business's password manager, and add the developer as a team member. If the developer's personal
> account owns them, sign-in breaks the day that person leaves.

## What you need first

1. The website live on its own domain over **HTTPS** (see [DEPLOYMENT.md](DEPLOYMENT.md)). Below the domain is
   written `smallafrica.ng`: use the real one.
2. Access to the server's `backend/.env` file.
3. The privacy policy and terms pages are already on the site: `https://smallafrica.ng/privacy` and
   `https://smallafrica.ng/terms`. The providers ask for these addresses.

**The three "redirect" addresses.** Each provider asks where to send customers back after they
approve. They are always `https://<your domain>/api/auth/oauth/<provider>/callback`:

```
https://smallafrica.ng/api/auth/oauth/google/callback
https://smallafrica.ng/api/auth/oauth/facebook/callback
https://smallafrica.ng/api/auth/oauth/apple/callback
```

They must match **exactly** (https, no trailing slash, same spelling). A mismatch is the most common
setup mistake.

Add this line to `backend/.env` once (the API's public address, with no trailing slash):

```
OAUTH_REDIRECT_BASE=https://smallafrica.ng/api
```

Also check that `APP_HTTPS=true` and `FRONTEND_URL=https://smallafrica.ng` are set (the sign-in cookie
needs HTTPS, and customers are sent back to `FRONTEND_URL`).

---

## 1. Google

1. Go to <https://console.cloud.google.com/> and sign in with the business Google account.
2. Create a project: top bar, project picker, **New project**, name it `Small Africa`.
3. **APIs & Services, then OAuth consent screen** (Google may call it *Google Auth Platform*):
   - User type **External**.
   - App name `Small Africa`, your support email, the logo from `design/logo/`.
   - **Authorised domains:** `smallafrica.ng`. Privacy policy link `https://smallafrica.ng/privacy`,
     terms link `https://smallafrica.ng/terms`.
   - **Scopes:** add only `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. These are
     the basic ones: no review by Google is needed.
   - Finish, then **Publish app** (move it from *Testing* to *In production*). While it is in *Testing*,
     only people you list as test users can sign in.
4. **APIs & Services, then Credentials, Create credentials, OAuth client ID:**
   - Application type **Web application**, name `Small Africa website`.
   - **Authorised JavaScript origins:** leave empty (sign-in happens on the server).
   - **Authorised redirect URIs:** `https://smallafrica.ng/api/auth/oauth/google/callback`
   - Create. Copy the **Client ID** and **Client secret**.
5. Put them in `backend/.env`:

   ```
   GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
   ```

**Test it:** open the site in a private window, go to *Create account*, click *Continue with Google*.
You should land on the "Almost there" page.

## 2. Facebook

1. Go to <https://developers.facebook.com/>, log in with the business owner's Facebook account and
   register as a developer.
2. **My Apps, Create app.** Use case **Authenticate and request data from users with Facebook Login**.
   Name `Small Africa`, the business email.
3. In the app: **Add product, Facebook Login** (for the Web). Under **Facebook Login, Settings:**
   - **Valid OAuth Redirect URIs:** `https://smallafrica.ng/api/auth/oauth/facebook/callback`
   - Leave *Client OAuth login* and *Web OAuth login* on, and *Use Strict Mode for redirect URIs* on.
4. **App settings, Basic:**
   - **App domains:** `smallafrica.ng`.
   - **Privacy Policy URL:** `https://smallafrica.ng/privacy`. **Terms of Service URL:**
     `https://smallafrica.ng/terms`.
   - **User data deletion:** choose *Data deletion instructions URL* and enter
     `https://smallafrica.ng/privacy#your-rights`.
   - Pick a **Category** (for example *Food & Drink*) and add an app icon.
   - Copy the **App ID** and **App secret** (click *Show*).
5. **Go live:** at the top of the dashboard switch the app from **Development** to **Live**. While it
   is in Development, only people with a role on the app (you, testers) can sign in. The permissions
   used (`public_profile` and `email`) are the basic ones and need no app review.
6. Put them in `backend/.env`:

   ```
   FACEBOOK_APP_ID=1234567890123456
   FACEBOOK_APP_SECRET=0123456789abcdef0123456789abcdef
   ```

**Good to know:** some Facebook accounts have no email (or only a phone number). The site handles it:
the customer is asked for an email on the "Almost there" page and must confirm it. Facebook never says
an email is confirmed, so the site never uses it to attach a sign-in to an existing account.

## 3. Apple

Sign in with Apple needs the **Apple Developer Program** (**US$99 per year**, or the local price) and an
Apple ID with two-factor sign-in. Enrolling as an **organisation** (recommended: the company's name
appears, not a person's) needs a free **D-U-N-S number**, which Apple can help you get. Allow a few days.

1. Enrol at <https://developer.apple.com/programs/enroll/> with the business Apple ID.
2. Go to <https://developer.apple.com/account/>, **Certificates, Identifiers & Profiles, Identifiers.**
3. **Create an App ID** (type *App IDs, App*): description `Small Africa`, a Bundle ID such as
   `ng.smallafrica.app`, and tick the capability **Sign in with Apple**.
4. **Create a Services ID** (the + button, type *Services IDs*): description `Small Africa website`,
   identifier `ng.smallafrica.web`. Open it, tick **Sign in with Apple**, click **Configure**:
   - **Primary App ID:** the App ID from step 3.
   - **Domains and subdomains:** `smallafrica.ng` (just the domain: no `https://`).
   - **Return URLs:** `https://smallafrica.ng/api/auth/oauth/apple/callback`
   - If Apple asks you to **verify the domain**, download the file it gives you and put it on the site at
     the exact address it shows (usually `https://smallafrica.ng/.well-known/apple-developer-domain-association.txt`),
     then click **Verify**.
5. **Keys, +:** name `Small Africa sign-in`, tick **Sign in with Apple**, **Configure** (choose the App ID),
   **Continue, Register, Download**.
   - **You can only download the key once.** Keep the `AuthKey_XXXXXXXXXX.p8` file safe (password manager) and
     note the **Key ID** (10 characters, also in the file name).
6. Your **Team ID** is at the top right of the developer account page, or under *Membership details*.
7. Put the `.p8` file on the server **outside the web folder** (for example
   `/home/<account>/smallafrica/secrets/AuthKey_XXXXXXXXXX.p8`) and make it private:
   `chmod 600 AuthKey_XXXXXXXXXX.p8`. Then in `backend/.env`:

   ```
   APPLE_CLIENT_ID=ng.smallafrica.web          # the Services ID, not the App ID
   APPLE_TEAM_ID=ABCDE12345
   APPLE_KEY_ID=XXXXXXXXXX
   APPLE_PRIVATE_KEY_PATH=/home/<account>/smallafrica/secrets/AuthKey_XXXXXXXXXX.p8
   ```

**Good to know**
- Apple only sends the customer's **name the first time** they sign in. The site saves it then.
- Customers can choose **Hide My Email**: Apple gives a private relay address
  (`...@privaterelay.appleid.com`). It is a real inbox, so the site accepts it. To let our emails
  (order confirmations) reach relay addresses, register your sending domain with Apple under
  **Services, Sign in with Apple for Email Communication** (add the domain and the SMTP sender address).
- Apple does not accept `localhost` as a return URL, so Apple sign-in can only be tested on a real
  HTTPS address (the live site, or a staging copy).

---

## After the keys are in

1. Nothing needs rebuilding: the website asks the server which providers are switched on
   (`/api/auth/providers`) and shows only those. The answer is remembered for up to five minutes.
2. **Test each provider** with a personal account, in a private browser window:
   1. *Create account, Continue with ...* then the "Almost there" page (phone, optional birthday and referral
      code, tick the terms, *Finish and start earning*). You should land on your account.
   2. Sign out, then *Sign in, Continue with ...*: it should take you straight to your account.
   3. *Account, Settings, Connected accounts*: connect another provider, then disconnect one. Disconnecting
      your **only** sign-in method must be refused until you add a password in the *Password* section.
   4. As an admin, open **Admin, Audit log**: the sign-ins and connections are listed
      (`auth.social_login`, `auth.social_connected`, `auth.welcome_completed`...).
3. **Staff and admins can't use social sign-in** by design (they keep password plus two-step
   sign-in). If a staff member tries, they see a message explaining it.

## If something goes wrong

| What you see | Usual cause and fix |
|---|---|
| The provider's page says **redirect_uri_mismatch** (or "URL blocked") | The redirect address in the provider's console isn't *exactly* `https://<domain>/api/auth/oauth/<provider>/callback`. Fix the console, or `OAUTH_REDIRECT_BASE` in `.env`. |
| Back on the login page with **"We couldn't complete that sign-in"** | Look at `backend/storage/logs/` (the line starts `Social sign-in did not complete` and says why). Common: wrong secret, clock far off on the server, provider app not live. |
| **"That sign-in took too long"** | The customer waited over 10 minutes, or the browser blocks cookies. Try again. For Apple the site must be on HTTPS with `APP_HTTPS=true` (the sign-in cookie must be `SameSite=None; Secure`). |
| Facebook says the app is **not available** / only testers can log in | The Facebook app is still in *Development* mode: switch it to *Live*. |
| Google says **access blocked: app not verified** | The consent screen is still *Testing*, or extra sensitive scopes were added. Publish it; use only the three basic scopes. |
| Apple: **invalid_client** | Services ID, Team ID, Key ID or the `.p8` file don't belong together. Check `APPLE_*` in `.env`, that the file is readable by PHP, and that the Services ID has the domain and return URL. |
| A button is missing | That provider's keys aren't all set (or the `.p8` path is wrong): by design the button is hidden. |
| A provider ever rejects the PKCE parameters | Set `GOOGLE_PKCE=false`, `FACEBOOK_PKCE=false` or `APPLE_PKCE=false` for that provider (they are on by default). Tell the developer: it should not be needed. |

## Security notes (for the developer)

- Flow: authorization code with **state**, **nonce** (Google, Apple) and **PKCE**. The code is exchanged on the
  server; Google and Apple ID tokens are verified (signature against the provider's published RS256 keys,
  issuer, audience, expiry, nonce) with `firebase/php-jwt`. Facebook's profile is read from the Graph API.
  Nothing the browser sends decides who a person is.
- The attempt is kept in a sealed, `HttpOnly`, ten-minute `sa_oauth` cookie rather than the session, because
  Apple answers with a cross-site POST that doesn't carry `SameSite=Lax` cookies. Apple's callback is exempt
  from the CSRF header check for the same reason; the state check protects it instead.
- A provider email that the provider **confirms** can be linked to an existing account; one it doesn't confirm
  (always the case for Facebook) is never linked: the customer signs in with their password first and
  connects the provider from Settings.
- Staff and admin accounts can't use or connect social sign-in.
- Full details: [SECURITY.md](SECURITY.md).

## Cost summary

| Item | Cost |
|---|---|
| Google sign-in | Free |
| Facebook Login | Free |
| Apple Developer Program (needed for Sign in with Apple) | **US$99 a year** (or local pricing) |
| D-U-N-S number for an organisation (if the business doesn't have one) | Free |

If the business would rather not pay for Apple yet, simply leave the `APPLE_*` values empty: the Apple button
stays hidden, and Google and Facebook work as normal. It can be added any time later without any code change.
