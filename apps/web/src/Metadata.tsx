import { Children, Fragment, isValidElement, type ReactNode } from "react";

export function Metadata({ parts, className = "" }: { parts: ReactNode[]; className?: string }) {
  const visibleParts = parts.filter((part) => part !== null && part !== undefined && part !== false && part !== "");
  return <span className={`metadata-parts ${className}`.trim()}>{visibleParts.map((part, index) => <Fragment key={index}>{index > 0 ? " " : null}<span className="metadata-part">{part}</span></Fragment>)}</span>;
}

/** Provider metadata can still arrive as a single string. Separate it at the view boundary. */
export function MetadataText({ text }: { text: ReactNode }) {
  const groups: ReactNode[][] = [[]];
  let separated = false;
  const collect = (children: ReactNode) => Children.forEach(children, (child) => {
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
      collect(child.props.children);
    } else if (typeof child === "string") {
      const values = child.split(/\s+·\s+|\s*•\s*/);
      values.forEach((value, index) => {
        if (index > 0) { groups.push([]); separated = true; }
        if (value.trim()) groups[groups.length - 1].push(value);
      });
    } else if (child !== null && child !== undefined && typeof child !== "boolean") {
      groups[groups.length - 1].push(child);
    }
  });
  collect(text);
  return separated ? <Metadata parts={groups.filter((group) => group.length > 0).map((group) => <>{group}</>)} /> : <>{text}</>;
}
