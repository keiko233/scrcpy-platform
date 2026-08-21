import { useEffect, useState } from "react";

import { highlightLogMessage } from "./highlight";

export function LogMessage({ message }: { message: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    highlightLogMessage(message).then((result) => {
      if (active) setHtml(result);
    });
    return () => {
      active = false;
    };
  }, [message]);

  if (html === null) {
    return (
      <div className="wrap-break-word whitespace-pre-wrap text-foreground">
        {message}
      </div>
    );
  }

  return (
    <div
      className="log-message wrap-break-word"
      dangerouslySetInnerHTML={{
        __html: html,
      }}
    />
  );
}
