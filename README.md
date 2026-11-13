This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Sharing notes

Any note can be shared through a read-only link:

1. Open a note and click **Share** in the top bar.
2. Click **Create link** — this generates an unlisted URL like `/share/<token>`.
3. Copy the link and send it to anyone. They can view the note as formatted Markdown without signing in.
4. The link is a live mirror: edits you make to the note show up on the shared page automatically.
5. Click **Stop sharing** in the dialog to revoke the link immediately.

### Deployment

Set `NEXT_PUBLIC_APP_URL` to your production domain on your hosting platform so share links use the correct URL (e.g. `https://keynotes-v1.vercel.app`). If unset, links fall back to the browser's origin.

Before public links work, publish `database.rules.json` to Firebase:

```bash
firebase database:rules:set database.rules.json
```

Or upload it via Firebase Console → Realtime Database → Rules. The rules keep private notes owner-only while allowing anyone with a share token to read that note's public mirror. Shares cannot be listed anonymously.


This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# keynotes-v1
