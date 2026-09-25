// Reusable container, row and status-mark components that take a className.
import './styles/boxComponents.css'

type ChildrenPropType = { children: React.ReactNode,
 className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
  // A div takes no focus and announces nothing. A caller that turns a box into a
  // control passes these so the box is reachable with the keyboard as well.
  role?: string;
  tabIndex?: number;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

export function BoxContainer({ children, className, onClick, style, role, tabIndex, onKeyDown }: ChildrenPropType) {
  return (
    <div
      className={`box-container ${className}`.trim()}
      onClick={onClick}
      style={style}
      role={role}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
export function BoxRow({ children , className}: ChildrenPropType) {
  return <div className={`box__row  box-row ${className}`.trim()}>{children}</div>;
}

export function StatusSquare({
  alert,
}: {
  alert: string;
}) {
  return <span className={`status__square ${alert}`}>
  </span>;
}

//-----StatusStar
// A star marks a reached goal: it reads as an achievement and survives colour blindness.
// aria-hidden, like the square: both sit beside a word that already names the state.
export function StatusStar({ tone }: { tone: 'complete' | 'info' }) {
  return (
    <svg
      className={`status__star status__star--${tone}`}
      viewBox='0 0 12 12'
      aria-hidden='true'
      focusable='false'
    >
      <polygon points='6 0.5 7.41 4.56 11.71 4.65 8.28 7.24 9.53 11.35 6 8.9 2.47 11.35 3.72 7.24 0.29 4.65 4.59 4.56' fill='currentColor' />
    </svg>
  );
}