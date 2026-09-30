import { useState } from "react";

export default function AttachmentThumb({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const [broken, setBroken] = useState(false);
  if (broken)
    return (
      <span className="feedback-attachment__fallback" aria-hidden="true">
        No preview
      </span>
    );
  return <img src={src} alt={alt} onError={() => setBroken(true)} />;
}
