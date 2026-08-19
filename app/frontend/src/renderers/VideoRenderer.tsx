// Authored by Karter Whitman using Claude Opus 4.8
// A YouTube embed. The format ladder only calls something `video` when
// its url matches a watch/short/embed pattern, so the id is always
// extractable — but if it somehow isn't, say so rather than showing an
// empty frame.
import { VideoEmbed, youtubeId } from "../components/VideoEmbed.tsx";
import type { RendererProps } from "./registry.tsx";

export function VideoRenderer({ item, resource }: RendererProps) {
  if (!youtubeId(resource.uri)) {
    return <p className="renderer-missing">this link isn’t a video after all</p>;
  }

  return (
    <VideoEmbed
      title={(item.data.display_name?.value as string | undefined) ?? (item.data.name.value as string)}
      uri={resource.uri}
    />
  );
}
