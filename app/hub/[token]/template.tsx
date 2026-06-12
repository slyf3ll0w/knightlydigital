/** Tab-to-tab navigation inside the hub gets the same quick entrance fade
 * as the app (the hero animates once on load via .anim-portal). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
