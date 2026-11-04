import { Children, Fragment, isValidElement, type ReactNode } from "react";

function metadataGroups(text: ReactNode) {
  const groups: ReactNode[][] = [[]];
  let separated = false;
  const collect = (children: ReactNode) => Children.forEach(children, (child) => {
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
      collect(child.props.children);
    } else if (typeof child === "string") {
      child.split(/\s+·\s+|\s*•\s*/).forEach((value, index) => {
        if (index > 0) { groups.push([]); separated = true; }
        if (value) groups[groups.length - 1].push(value);
      });
    } else if (child !== null && child !== undefined && typeof child !== "boolean") {
      groups[groups.length - 1].push(child);
    }
  });
  collect(text);
  return {
    separated,
    groups: groups.filter((group) => group.some((part) => typeof part === "string" ? Boolean(part.trim()) : part !== null && part !== undefined && typeof part !== "boolean")),
  };
}

export function Metadata({ parts, className = "" }: { parts: ReactNode[]; className?: string }) {
  const visibleParts = parts.flatMap((part) => metadataGroups(part).groups);
  return <span className={`metadata-parts ${className}`.trim()}>{visibleParts.map((part, index) => <Fragment key={index}>{index > 0 ? " " : null}<span className="metadata-part">{part}</span></Fragment>)}</span>;
}

/** Provider metadata can still arrive as a single string. Separate it at the view boundary. */
export function MetadataText({ text }: { text: ReactNode }) {
  const { groups, separated } = metadataGroups(text);
  return separated ? <Metadata parts={groups.map((group) => <>{group}</>)} /> : <>{text}</>;
}
