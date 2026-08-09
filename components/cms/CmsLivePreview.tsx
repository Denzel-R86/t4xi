import { draftMode } from "next/headers";
import { VisualEditing } from "next-sanity/visual-editing";
import { SanityLive } from "@/sanity/lib/live";

/** Alleen opnemen op routes die daadwerkelijk CMS-content ophalen. */
export default async function CmsLivePreview() {
  const preview = (await draftMode()).isEnabled;
  return (
    <>
      <SanityLive />
      {preview && <VisualEditing />}
    </>
  );
}
