# Frontend production deployment

The GitHub Actions workflow at `.github/workflows/deploy-vercel.yml` deploys the
frontend to Vercel on pushes to `main` or when started manually. It pulls the
Vercel production settings, builds the app, and deploys the prebuilt output.
The workflow sets `VITE_API_BASE_URL=https://api.baakio.shop` at build time.
Vercel publishes `index.html` and `app.html` as separate pages.
`vercel.json` disables Vercel's automatic Git deployment, so each push uses
only this GitHub Actions workflow.

## One-time setup

1. Create a Vercel project for `sanjaygupta45/Baakio-fe` with the project root
   at the repository root. Use the Vite framework preset. Find its `orgId` and
   `projectId` in `.vercel/project.json` after linking with `vercel link`, or
   in the Vercel project settings.
2. Create a Vercel access token and add it to this GitHub repository under
   **Settings → Secrets and variables → Actions** as the repository secret
   `VERCEL_TOKEN`. Add the IDs as `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`
   repository secrets. Do not commit the token or the `.vercel/` directory.
3. In Vercel, add `baakio.shop` as a production domain for the project. Set
   GoDaddy's apex DNS records to the values Vercel gives you. Keep the
   existing `api` and `auth` records for Cloud Run and Resend.
4. Run the workflow manually once. Check `https://baakio.shop/` and
   `https://baakio.shop/app.html`, then test browser sign-in against
   `https://api.baakio.shop`. Later pushes to `main` deploy automatically.

The backend CORS policy allows `https://baakio.shop`. The workflow deploys
production only; Vercel preview domains cannot use the production API with
browser credentials until they are allowed by the backend.
