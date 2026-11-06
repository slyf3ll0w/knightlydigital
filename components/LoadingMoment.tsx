/**
 * The loading bar: a thin line in the company's primary color across the
 * top of the screen while the next page loads (David 2026-11-06, ticket
 * #2lyand: the earlier floating pill with a tool icon and a one-liner did not
 * look right). It sits beside each loading.tsx skeleton.
 *
 * CSS only (app/moment.css): it stays invisible for the first moment, so a
 * page that arrives quickly never flashes it, then creeps toward the end
 * without ever claiming to be done. `pointer-events: none`.
 */
export default function LoadingMoment() {
  return (
    <div className="wb-loadbar" role="progressbar" aria-label="Loading" aria-busy="true">
      <span />
    </div>
  );
}
