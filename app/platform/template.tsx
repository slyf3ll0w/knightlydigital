/**
 * Re-mounts on every navigation (unlike layout), giving each page a quick
 * entrance fade. Animation is from-only with no fill mode, so once it ends
 * there's no lingering transform to break fixed/sticky descendants.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
