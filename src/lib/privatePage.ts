import { useEffect } from "react";

/**
 * For pages a stranger can open with a link (the website, an RSVP link): search engines
 * are asked not to list them, and the address isn't passed on to other sites.
 */
export function usePrivatePage(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    const metas = [
      Object.assign(document.createElement("meta"), { name: "robots", content: "noindex, nofollow" }),
      Object.assign(document.createElement("meta"), { name: "referrer", content: "no-referrer" }),
    ];
    for (const m of metas) document.head.appendChild(m);
    return () => {
      document.title = previous;
      for (const m of metas) m.remove();
    };
  }, [title]);
}
