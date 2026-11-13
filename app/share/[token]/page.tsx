export const instant = false;

import { Suspense, use } from "react";
import ShareView from "@/components/share-view";

export default function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center px-6">Loading shared note…</div>}>
      <ShareView token={token} />
    </Suspense>
  );
}
