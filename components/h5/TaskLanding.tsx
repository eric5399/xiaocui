"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getResumePath } from "./mock-data";
import { ensureAnonymousSession } from "./auth-client";
import { H5Frame, LoadingPanel } from "./H5Frame";
import { useH5Progress } from "./use-h5-progress";

export function TaskLanding({ inviteCode }: { inviteCode: string }) {
  const router = useRouter();
  const { progress, ready, updateProgress } = useH5Progress(inviteCode);

  useEffect(() => {
    if (!ready) return;
    void (async () => {
      try {
        await ensureAnonymousSession();
      } catch {
        // Mock mode does not need a browser session; protected environments
        // will surface an actionable error from the task request instead.
      }
      if (progress.status === "new") {
        updateProgress({ status: "profile" });
        router.replace(`/t/${inviteCode}/profile`);
        return;
      }
      router.replace(getResumePath(progress));
    })();
  }, [inviteCode, progress, ready, router, updateProgress]);

  if (!ready) {
    return (
      <H5Frame activeStep={0} backHref="/join">
        <LoadingPanel />
      </H5Frame>
    );
  }

  return (
    <H5Frame quietHeader>
      <LoadingPanel label="正在进入任务" />
    </H5Frame>
  );
}
