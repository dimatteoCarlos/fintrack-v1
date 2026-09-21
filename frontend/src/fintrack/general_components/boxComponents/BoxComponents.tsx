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

// The square's sibling for a FINISHED reading, the only mark on the pocket scale
// told apart by shape. It takes no props: a tick means one thing. aria-hidden,
// like the square, because both stand beside a word that already names the state.
export function StatusTick() {
  return <span className='status__tick' aria-hidden='true'></span>;
}