# website
Official public website for LAJEMBO

## Controlled integration preview

Use a Supabase test database with the main LAJEMBO migrations, test-only users and data, and live payment routes disabled. Configure Auth redirects and any email or SMS delivery for test addresses and numbers. Set the app preview's Supabase URL and publishable key to the same test project.

To build the website copy, provide `LAJEMBO_TEST_SUPABASE_URL` and `LAJEMBO_TEST_SUPABASE_PUBLISHABLE_KEY` and run:

```sh
preview_directory=$(node scripts/build-integration-preview.mjs)
python3 -m http.server --bind 127.0.0.1 --directory "$preview_directory" 8080
```

Open `http://127.0.0.1:8080` in a dedicated browser profile for test accounts. The build uses a temporary directory, omits the public site's domain binding, and limits browser API calls to the selected test backend. Local Supabase can use its loopback URL and anon key.
