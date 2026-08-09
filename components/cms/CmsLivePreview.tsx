import { draftMode } from "next/headers";
import { VisualEditing } from "next-sanity";
import { SanityLive } from "@/sanity/lib/live";

/** Alleen opnemen op routes die daadwerkelijk CMS-content ophalen. */
export default function CmsLivePreview() {
  const preview = draftMode().isEnabled;
  return (
    <>
      <SanityLive />
      {preview && <VisualEditing />}
    </>
  );
}
